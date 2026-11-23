import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { ParentRole } from '@/src/domain/achievements';
import { assess } from '@/src/domain/functionalLevel';
import { applyBreak, currentAgeYears, needsNewClearance, type BreakReason } from '@/src/domain/profile';
import { restoreState } from '@/src/domain/storage';
import { applySessionResult, type ProgressionResult } from '@/src/domain/progression';
import type { ThemeName } from '@/src/ui/kit';
import { MAX_MESSAGE_LENGTH, deliver, type ChatMessage } from '@/src/chat/source';
import type {
  ChildProfile,
  Difficulty,
  FamilyGoal,
  Feedback,
  GoalRating,
  PracticeLog,
  FunctionalAssessment,
  ProgressMap,
  SessionLog,
  TrackingResult,
  WorkoutPlan,
} from '@/src/domain/types';

/**
 * Состояние приложения. Пока хранится локально на устройстве (AsyncStorage).
 * Следующий шаг — синхронизация с сервером (см. README, раздел «Бэкенд»),
 * чтобы куратор видел прогресс и данные не терялись при смене телефона.
 */
export interface User {
  name: string;
  email: string;
  /** Когда родитель дал согласие на обработку данных о себе и ребёнке. */
  consentAt?: string;
  /** Кем родитель приходится ребёнку — для обращения и названия значка. */
  role?: ParentRole;
}

export type ChildInput = Omit<ChildProfile, 'id' | 'createdAt' | 'doctorClearanceConfirmed' | 'ageSetAt'>;

/**
 * Что не так с хранилищем на устройстве:
 * `corrupt` — прежние данные не прочитались (их копия отложена отдельно), `unavailable` — данные не сохраняются.
 */
export type StorageProblem = 'corrupt' | 'unavailable';

interface PersistedState {
  user?: User;
  child?: ChildProfile;
  assessment?: FunctionalAssessment;
  progress: ProgressMap;
  sessions: SessionLog[];
  trackingResults: TrackingResult[];
  /** Когда родитель прочитал и принял правила занятий. */
  rulesAcceptedAt?: string;
  /** Занятие с болью, после которого родитель подтвердил, что можно продолжать. */
  painAcknowledgedSessionId?: string;
  /** Последнее занятие, после которого родитель уже ответил о причине перерыва. */
  breakHandledSessionId?: string;
  /** Текущая цель семьи и прежние цели. */
  goal?: FamilyGoal;
  pastGoals?: FamilyGoal[];
  /** Какие статьи родитель уже открывал. */
  readArticles?: string[];
  /** Упражнения, сделанные отдельно от занятия. */
  practices?: PracticeLog[];
  /** Выбранное оформление; пусто — по полу ребёнка. */
  theme?: ThemeName;
  /** Переписка с куратором. */
  chat?: ChatMessage[];
  /**
   * Разовое пояснение после обновления: диагноз больше не хранится, появились новые вопросы о запретах врача.
   * Снимается, когда родитель закрыл пояснение или заново ответил на вопросы.
   */
  profileNotice?: 'profile_updated';
}

/** Уточнения к отзыву о занятии. */
export interface SessionDetails {
  itemFeedback?: Record<string, Feedback>;
  painSigns?: string[];
  painArea?: string;
  durationSec?: number;
}

const EMPTY: PersistedState = { progress: {}, sessions: [], trackingResults: [] };
const STORAGE_KEY = 'move4fit/state/v1';
/** Сюда откладывается копия данных, которые не удалось прочитать, — чтобы их можно было восстановить. */
const CORRUPT_BACKUP_KEY = 'move4fit/state/v1/unreadable';

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

interface AppStateValue extends PersistedState {
  ready: boolean;
  /** Проблема с хранилищем на устройстве, о которой стоит сказать родителю. */
  storageProblem?: StorageProblem;
  signUp(user: User): void;
  saveChild(child: ChildInput): ChildProfile;
  /** Родитель прочитал пояснение об изменениях в профиле. */
  dismissProfileNotice(): void;
  /** Изменить профиль; уровень и противопоказания пересчитываются по прежним ответам анкеты. */
  updateChild(child: ChildInput): void;
  acceptRules(): void;
  acknowledgePain(): void;
  saveAssessment(a: FunctionalAssessment): void;
  confirmDoctorClearance(): void;
  completeSession(plan: WorkoutPlan, feedback: Feedback, pain: boolean, details?: SessionDetails): ProgressionResult;
  /** Ответ о причине перерыва: при необходимости снижает нагрузку. */
  resolveBreak(reason: BreakReason): void;
  /** Поставить новую цель; прежняя уходит в историю. */
  setGoal(text: string, presetId?: string): void;
  reviewGoal(rating: GoalRating): void;
  markArticleRead(id: string): void;
  /** Родитель сам выбрал вариант сложности упражнения. */
  setExerciseDifficulty(exerciseId: string, difficulty: Difficulty): void;
  /** Отдельно сделанное упражнение с оценкой: по ней подстраивается сложность этого упражнения. */
  addPractice(exerciseId: string, difficulty: Difficulty, durationSec?: number): string;
  /** Оценка уже сохранённой тренировки; по ней подстраивается сложность упражнения. */
  ratePractice(id: string, feedback: Feedback): void;
  setTheme(theme: ThemeName | undefined): void;
  /** Сообщение родителя куратору: сохраняется в переписке и передаётся на доставку. */
  sendMessage(text: string): void;
  addTrackingResult(testId: string, value: number): void;
  resetAll(): void;
}

const Ctx = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(EMPTY);
  const [ready, setReady] = useState(false);

  const [storageProblem, setStorageProblem] = useState<StorageProblem | undefined>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const { data, corrupt } = restoreState(raw);
        if (corrupt && raw) {
          // Прежде чем что-либо перезаписать, откладываем копию нечитаемых данных.
          await AsyncStorage.setItem(CORRUPT_BACKUP_KEY, raw);
          if (!cancelled) setStorageProblem('corrupt');
        }
        if (data && !cancelled) {
          const restored = { ...EMPTY, ...data } as PersistedState;
          // Старые записи без даты ввода возраста: считаем, что возраст указан сейчас (не «старим» ребёнка задним числом).
          if (restored.child && !restored.child.ageSetAt) {
            restored.child = { ...restored.child, ageSetAt: new Date().toISOString() };
          }
          setState(restored);
        }
      } catch {
        if (!cancelled) setStorageProblem('unavailable');
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      .then(() => setStorageProblem((p) => (p === 'unavailable' ? undefined : p)))
      .catch(() => setStorageProblem('unavailable'));
  }, [state, ready]);

  const signUp = useCallback((user: User) => setState((s) => ({ ...s, user })), []);

  const saveChild = useCallback<AppStateValue['saveChild']>((data) => {
    const now = new Date().toISOString();
    const child: ChildProfile = {
      ...data,
      id: newId(),
      createdAt: now,
      ageSetAt: now,
      doctorClearanceConfirmed: false,
    };
    setState((s) => ({ ...s, child, assessment: undefined }));
    return child;
  }, []);

  const saveAssessment = useCallback(
    (assessment: FunctionalAssessment) =>
      setState((s) => ({
        ...s,
        assessment,
        // Родитель ответил на вопросы в новом виде — пояснение об изменениях больше не нужно.
        profileNotice: undefined,
        // Появилась новая особенность, требующая разрешения врача, — прежнее подтверждение не действует.
        child:
          s.child && needsNewClearance(s.assessment, assessment)
            ? { ...s.child, doctorClearanceConfirmed: false }
            : s.child,
      })),
    [],
  );

  const updateChild = useCallback<AppStateValue['updateChild']>(
    (data) =>
      setState((s) => {
        if (!s.child) return s;
        const child: ChildProfile = { ...s.child, ...data, ageSetAt: new Date().toISOString() };
        // Пересчёт по прежним ответам: дата анкеты остаётся прежней — заново её не проходили.
        const assessment = s.assessment
          ? assess(child, s.assessment.answers, s.assessment.gmfcsReported, new Date(s.assessment.date))
          : undefined;
        return { ...s, child, assessment };
      }),
    [],
  );

  const dismissProfileNotice = useCallback(() => setState((s) => ({ ...s, profileNotice: undefined })), []);

  const acceptRules = useCallback(() => setState((s) => ({ ...s, rulesAcceptedAt: new Date().toISOString() })), []);

  const acknowledgePain = useCallback(
    () => setState((s) => ({ ...s, painAcknowledgedSessionId: s.sessions[s.sessions.length - 1]?.id })),
    [],
  );

  const confirmDoctorClearance = useCallback(
    () => setState((s) => (s.child ? { ...s, child: { ...s.child, doctorClearanceConfirmed: true } } : s)),
    [],
  );

  const completeSession = useCallback<AppStateValue['completeSession']>(
    (plan, feedback, pain, details) => {
      const result = applySessionResult(state.progress, plan.items, feedback, pain, details?.itemFeedback);
      const log: SessionLog = {
        id: newId(),
        childId: state.child?.id ?? '',
        date: new Date().toISOString(),
        items: plan.items,
        feedback,
        pain,
        itemFeedback: details?.itemFeedback,
        painSigns: pain ? details?.painSigns : undefined,
        painArea: pain ? details?.painArea : undefined,
        durationSec: details?.durationSec,
      };
      setState((s) => ({ ...s, progress: result.progress, sessions: [...s.sessions, log] }));
      return result;
    },
    [state.progress, state.child],
  );

  const addTrackingResult = useCallback(
    (testId: string, value: number) =>
      setState((s) => ({
        ...s,
        trackingResults: [
          ...s.trackingResults,
          { id: newId(), childId: s.child?.id ?? '', testId, value, date: new Date().toISOString() },
        ],
      })),
    [],
  );

  const resolveBreak = useCallback(
    (reason: BreakReason) =>
      setState((s) => ({
        ...s,
        progress: applyBreak(s.progress, reason),
        breakHandledSessionId: s.sessions[s.sessions.length - 1]?.id,
      })),
    [],
  );

  const setGoal = useCallback(
    (text: string, presetId?: string) =>
      setState((s) => ({
        ...s,
        pastGoals: s.goal ? [...(s.pastGoals ?? []), s.goal] : s.pastGoals,
        goal: { id: newId(), text, presetId, setAt: new Date().toISOString(), reviews: [] },
      })),
    [],
  );

  const reviewGoal = useCallback(
    (rating: GoalRating) =>
      setState((s) =>
        s.goal
          ? { ...s, goal: { ...s.goal, reviews: [...s.goal.reviews, { date: new Date().toISOString(), rating }] } }
          : s,
      ),
    [],
  );

  const markArticleRead = useCallback(
    (id: string) =>
      setState((s) => ((s.readArticles ?? []).includes(id) ? s : { ...s, readArticles: [...(s.readArticles ?? []), id] })),
    [],
  );

  const setExerciseDifficulty = useCallback(
    (exerciseId: string, difficulty: Difficulty) =>
      setState((s) => ({ ...s, progress: { ...s.progress, [exerciseId]: { difficulty, easyStreak: 0 } } })),
    [],
  );

  const addPractice = useCallback((exerciseId: string, difficulty: Difficulty, durationSec?: number) => {
    const id = newId();
    setState((s) => ({
      ...s,
      practices: [...(s.practices ?? []), { id, exerciseId, difficulty, durationSec, date: new Date().toISOString() }],
    }));
    return id;
  }, []);

  const ratePractice = useCallback(
    (id: string, feedback: Feedback) =>
      setState((s) => {
        const practice = (s.practices ?? []).find((p) => p.id === id);
        if (!practice || practice.feedback) return s;
        return {
          ...s,
          progress: applySessionResult(s.progress, [{ exerciseId: practice.exerciseId, difficulty: practice.difficulty }], feedback, false).progress,
          practices: (s.practices ?? []).map((p) => (p.id === id ? { ...p, feedback } : p)),
        };
      }),
    [],
  );

  const setTheme = useCallback((theme: ThemeName | undefined) => setState((s) => ({ ...s, theme })), []);

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!trimmed) return;
    const message: ChatMessage = { id: newId(), from: 'parent', text: trimmed, date: new Date().toISOString(), delivered: false };
    setState((s) => ({ ...s, chat: [...(s.chat ?? []), message] }));
    // Доставка идёт отдельно: сообщение уже сохранено в переписке, даже если отправить не удалось.
    deliver(message)
      .then((ok) => {
        if (ok) setState((s) => ({ ...s, chat: (s.chat ?? []).map((m) => (m.id === message.id ? { ...m, delivered: true } : m)) }));
      })
      .catch(() => {});
  }, []);

  const resetAll = useCallback(() => setState(EMPTY), []);

  // Экраны получают ребёнка с возрастом на сегодня: с момента ввода он «растёт» сам.
  const agedChild = useMemo(
    () => (state.child ? { ...state.child, ageYears: currentAgeYears(state.child) } : undefined),
    [state.child],
  );

  const value = useMemo<AppStateValue>(
    () => ({
      ...state,
      child: agedChild,
      ready,
      storageProblem,
      signUp,
      saveChild,
      updateChild,
      dismissProfileNotice,
      acceptRules,
      acknowledgePain,
      saveAssessment,
      confirmDoctorClearance,
      completeSession,
      resolveBreak,
      setGoal,
      reviewGoal,
      markArticleRead,
      setExerciseDifficulty,
      addPractice,
      ratePractice,
      setTheme,
      sendMessage,
      addTrackingResult,
      resetAll,
    }),
    [state, agedChild, ready, storageProblem, signUp, saveChild, updateChild, dismissProfileNotice, acceptRules, acknowledgePain, saveAssessment, confirmDoctorClearance, completeSession, resolveBreak, setGoal, reviewGoal, markArticleRead, setExerciseDifficulty, addPractice, ratePractice, setTheme, sendMessage, addTrackingResult, resetAll],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppStateProvider');
  return v;
}
