import type { Capability, ExerciseRisk, FunctionalLevel, SafetyAnswer, SafetyFlag } from './types';

// ---------- Тест движений из 5 пунктов ----------

/**
 * Тест из 5 пунктов: что ребёнок обычно делает сам.
 * ⚠️ ЧЕРНОВИК: состав пунктов, формулировки и связи с возможностями должен утвердить специалист
 * (ЛФК/реабилитолог).
 *
 * В каждом пункте варианты идут по возрастанию: родитель выбирает самое сложное, что ребёнок делает сам.
 * Вариант даёт свои возможности и все возможности вариантов ниже него в том же пункте.
 */
export interface MotorOption {
  id: string;
  label: string;
  /** Возможности, которые даёт этот вариант (вместе с более простыми вариантами пункта). */
  grants: Capability[];
  /** Вариант показывается, только если у ребёнка уже есть эта возможность. */
  requires?: Capability;
}

export interface MotorItem {
  id: string;
  /** Короткое название пункта — для профиля, кабинета и документа специалисту. */
  title: string;
  /** Вопрос родителю. */
  text: string;
  /** Пункт задаётся, только если у ребёнка уже есть эта возможность. Иначе считается «пока нет». */
  askIf?: Capability;
  options: MotorOption[];
}

export const MOTOR_ITEMS: MotorItem[] = [
  {
    id: 'm_posture',
    title: 'Голова и сидение',
    text: 'Как ребёнок держит голову и сидит?',
    options: [
      { id: 'none', label: 'Пока не держит голову', grants: [] },
      { id: 'head', label: 'Держит голову сам, когда сидит у вас на руках, но пока не сидит', grants: ['head_control'] },
      {
        id: 'sit_support',
        label: 'Сидит, если его немного поддерживать или посадить в кресло с опорой',
        grants: ['head_control', 'sit_with_support'],
      },
      {
        id: 'sit_free',
        label: 'Сидит сам на полу или на стуле, не опираясь на руки, хотя бы минуту',
        grants: ['head_control', 'sit_with_support', 'sit_independent'],
      },
    ],
  },
  {
    id: 'm_stand',
    title: 'Стояние',
    text: 'Как ребёнок стоит?',
    askIf: 'sit_with_support',
    options: [
      { id: 'none', label: 'Пока не стоит', grants: [] },
      { id: 'support', label: 'Стоит, держась за опору (мебель, ваши руки)', grants: ['stand_with_support'] },
      {
        id: 'free',
        label: 'Стоит сам, ни за что не держась, хотя бы несколько секунд',
        grants: ['stand_with_support', 'stand_independent'],
      },
    ],
  },
  {
    id: 'm_walk',
    title: 'Ходьба',
    text: 'Как ребёнок обычно передвигается?',
    askIf: 'stand_with_support',
    options: [
      { id: 'none', label: 'Пока не ходит', grants: [] },
      { id: 'device', label: 'Ходит с ходунками, тростями или держась за руку взрослого', grants: ['walk_with_device'] },
      { id: 'indoor', label: 'Ходит сам по квартире, а на улице нужна опора', grants: ['walk_independent'] },
      {
        id: 'outdoor',
        label: 'Ходит сам и дома, и на улице — по траве, неровной дорожке, в толпе',
        grants: ['walk_independent', 'walk_outdoors'],
      },
    ],
  },
  {
    id: 'm_stairs',
    title: 'Лестница',
    text: 'Как ребёнок поднимается по лестнице?',
    askIf: 'stand_with_support',
    options: [
      { id: 'none', label: 'Пока не поднимается или не пробовали', grants: [] },
      { id: 'rail', label: 'Поднимается, держась за перила', grants: ['stairs_with_rail'] },
      {
        id: 'free',
        label: 'Поднимается без перил',
        grants: ['stairs_with_rail', 'stairs_no_rail'],
        requires: 'walk_independent',
      },
    ],
  },
  {
    id: 'm_run',
    title: 'Бег и прыжки',
    text: 'Ребёнок бегает и может подпрыгнуть на двух ногах?',
    askIf: 'walk_independent',
    options: [
      { id: 'no', label: 'Пока нет', grants: [] },
      { id: 'yes', label: 'Да, бегает и прыгает', grants: ['run_jump'] },
    ],
  },
];

/** Варианты пункта, которые можно показать при уже известных возможностях. */
export function availableOptions(item: MotorItem, caps: ReadonlySet<Capability>): MotorOption[] {
  return item.options.filter((o) => !o.requires || caps.has(o.requires));
}

/**
 * Проходит по пунктам теста по порядку и возвращает возможности ребёнка и пункты, которые нужно задать.
 * Ответы на пункты, которые не задаются (предыдущая ступень не пройдена), и варианты без нужной
 * возможности игнорируются — так устаревший ответ не даёт лишнего.
 */
export function walkMotorItems(motor: Record<string, string>): { capabilities: Capability[]; visible: MotorItem[] } {
  const caps = new Set<Capability>();
  const visible: MotorItem[] = [];
  for (const item of MOTOR_ITEMS) {
    if (item.askIf && !caps.has(item.askIf)) continue;
    visible.push(item);
    const chosen = availableOptions(item, caps).find((o) => o.id === motor[item.id]);
    chosen?.grants.forEach((c) => caps.add(c));
  }
  return { capabilities: [...caps], visible };
}

/**
 * Ответы теста, соответствующие набору возможностей: в каждом пункте — самый высокий вариант,
 * «верхняя» возможность которого есть у ребёнка. Нужно, чтобы перевести ответы прежней анкеты.
 */
export function motorAnswersFromCapabilities(capabilities: readonly Capability[]): Record<string, string> {
  const motor: Record<string, string> = {};
  for (const item of MOTOR_ITEMS) {
    const best = [...item.options].reverse().find((o) => {
      const top = o.grants[o.grants.length - 1];
      return top !== undefined && capabilities.includes(top);
    });
    motor[item.id] = (best ?? item.options[0]).id;
  }
  return motor;
}

// ---------- Уровень GMFCS со слов врача ----------

export const GMFCS_ROMAN: Record<FunctionalLevel, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };

/**
 * Подписи уровней GMFCS для родителя: цифра без пояснения легко путается с группой инвалидности.
 * ⚠️ ЧЕРНОВИК: формулировки должен утвердить специалист.
 */
export const GMFCS_OPTIONS: { level: FunctionalLevel; label: string }[] = [
  { level: 1, label: 'I — ходит сам, бегает и прыгает' },
  { level: 2, label: 'II — ходит сам, но на лестнице и на улице нужна опора' },
  { level: 3, label: 'III — ходит с ходунками или тростями' },
  { level: 4, label: 'IV — сидит сам, передвигается в основном в коляске' },
  { level: 5, label: 'V — нужна поддержка головы и корпуса' },
];

// ---------- Ограничения и противопоказания ----------

/**
 * Вопросы об ограничениях.
 * ⚠️ ЧЕРНОВИК: формулировки должен проверить специалист (ЛФК/реабилитолог).
 */
export interface SafetyQuestion {
  id: string;
  text: string;
  flag: SafetyFlag;
  /**
   * Можно ответить «Не знаю, с врачом не обсуждали». Тогда упражнения исключаются так же, как при «да»:
   * раньше эти исключения ставились автоматически по диагнозу, и «не знаю» не должно их снимать.
   */
  allowUnknown?: boolean;
}

export const SAFETY_QUESTIONS: SafetyQuestion[] = [
  { id: 's_seizures', text: 'Бывают ли у ребёнка судороги или приступы, которые сейчас не под контролем лечения?', flag: 'uncontrolled_seizures' },
  { id: 's_surgery', text: 'Была ли у ребёнка операция за последние 6 месяцев?', flag: 'recent_surgery' },
  { id: 's_botox', text: 'Делали ли ребёнку уколы ботулотоксина за последний месяц?', flag: 'recent_botulinum' },
  { id: 's_hip', text: 'Говорил ли врач о подвывихе или вывихе тазобедренного сустава?', flag: 'hip_instability' },
  { id: 's_shunt', text: 'Установлен ли у ребёнка шунт?', flag: 'shunt' },
  { id: 's_bones', text: 'Были ли переломы при небольших нагрузках или говорил ли врач о хрупкости костей?', flag: 'fragile_bones' },
  { id: 's_heart', text: 'Есть ли у ребёнка заболевание сердца, при котором ограничивают нагрузку?', flag: 'heart_condition' },
  {
    id: 's_neck',
    text: 'Говорил ли врач, что ребёнку нельзя кувыркаться, стоять на голове или наклоняться вниз головой (например, из-за нестабильности шеи)?',
    flag: 'neck_instability',
    allowUnknown: true,
  },
  { id: 's_impact', text: 'Запрещал ли врач ребёнку прыжки и спрыгивания с высоты?', flag: 'no_impact', allowUnknown: true },
  {
    id: 's_other',
    text: 'Есть ли другие запреты врача на движения или нагрузку, о которых мы не спросили?',
    flag: 'other_restriction',
  },
];

/**
 * ⚠️ ЧЕРНОВИК МЕДИЦИНСКОЙ ЛОГИКИ — требует проверки квалифицированным специалистом.
 * Особенности, при которых занятия показываются только после подтверждения разрешения врача.
 * «Другие запреты» здесь потому, что приложение о них ничего не знает и само исключить упражнения не может.
 */
export const CLEARANCE_FLAGS: SafetyFlag[] = ['uncontrolled_seizures', 'recent_surgery', 'heart_condition', 'other_restriction'];

/** ⚠️ ЧЕРНОВИК: какие характеристики упражнений исключаются при каждой особенности. */
export const FLAG_EXCLUSIONS: Record<SafetyFlag, ExerciseRisk[]> = {
  uncontrolled_seizures: ['high_intensity', 'breath_holding', 'head_down'],
  recent_surgery: ['impact', 'hip_loading', 'high_intensity'],
  recent_botulinum: [],
  hip_instability: ['hip_loading', 'impact'],
  shunt: ['head_down', 'impact', 'neck_flexion'],
  fragile_bones: ['impact', 'hip_loading'],
  heart_condition: ['high_intensity', 'breath_holding'],
  // Раньше эти два исключения следовали из диагноза; теперь — из прямого вопроса о запрете врача.
  neck_instability: ['neck_flexion', 'head_down'],
  no_impact: ['impact'],
  other_restriction: [],
};

/** Ограничения словами — для профиля, сводки и кабинета. */
export const FLAG_LABELS: Record<SafetyFlag, string> = {
  uncontrolled_seizures: 'судороги не под контролем',
  recent_surgery: 'операция за последние 6 месяцев',
  recent_botulinum: 'ботулинотерапия за последний месяц',
  hip_instability: 'подвывих или вывих тазобедренного сустава',
  shunt: 'шунт',
  fragile_bones: 'хрупкость костей',
  heart_condition: 'заболевание сердца',
  neck_instability: 'запрет на кувырки и наклоны вниз головой',
  no_impact: 'запрет на прыжки',
  other_restriction: 'другие запреты врача',
};

/** Что именно не предлагается — словами для родителя. */
export const RISK_LABELS: Record<ExerciseRisk, string> = {
  impact: 'прыжки и удары',
  hip_loading: 'нагрузка на тазобедренный сустав',
  head_down: 'положение вниз головой',
  neck_flexion: 'сильное сгибание шеи',
  breath_holding: 'натуживание',
  high_intensity: 'высокая интенсивность',
};

/** Допустимое значение ответа на вопрос об ограничении; всё остальное считается «нет ответа». */
export function isSafetyAnswer(x: unknown): x is SafetyAnswer {
  return x === 'yes' || x === 'no' || x === 'unknown';
}
