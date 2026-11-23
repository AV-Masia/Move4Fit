import { EXERCISES, TRACKING_TESTS } from './exercises';
import { LEVEL_DESCRIPTIONS } from './functionalLevel';
import { FLAG_LABELS, GMFCS_ROMAN } from './questionnaire';
import { goalRatingLabel } from './goals';
import { PAIN_AREAS, PAIN_SIGNS, formatAge } from './profile';
import type { ChildProfile, FamilyGoal, FunctionalAssessment, SessionLog, TrackingResult } from './types';

const DAY = 24 * 3600 * 1000;
const fmt = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
const title = (id: string) => EXERCISES.find((e) => e.id === id)?.title ?? id;

/**
 * Сводка для куратора или врача за последние 30 дней — обычный текст.
 * Родитель видит её целиком и сам решает, показывать или пересылать: автоматически ничего не отправляется.
 */
export function buildSummary(
  child: ChildProfile,
  assessment: FunctionalAssessment | undefined,
  sessions: SessionLog[],
  trackingResults: TrackingResult[],
  goal: FamilyGoal | undefined,
  today: Date = new Date(),
): string {
  const recent = sessions.filter((s) => today.getTime() - new Date(s.date).getTime() <= 30 * DAY);
  const lines: string[] = [];

  // Диагноза в сводке нет: приложение его не хранит. Врач видит группу, уровень и ограничения.
  lines.push(`${child.name}, ${formatAge(child.ageYears)}.`);
  if (assessment) {
    lines.push(`Группа занятий: ${LEVEL_DESCRIPTIONS[assessment.level].title}.`);
    if (assessment.gmfcsReported) lines.push(`Уровень GMFCS со слов родителя: ${GMFCS_ROMAN[assessment.gmfcsReported]}.`);
    lines.push(
      `Ограничения и противопоказания: ${assessment.safetyFlags.length > 0 ? assessment.safetyFlags.map((f) => FLAG_LABELS[f]).join(', ') : 'не отмечены'}.`,
    );
    if (assessment.unsureFlags.length > 0) {
      lines.push(`Родитель не знает, просит уточнить: ${assessment.unsureFlags.map((f) => FLAG_LABELS[f]).join(', ')}.`);
    }
  }

  if (goal) {
    const last = goal.reviews[goal.reviews.length - 1];
    lines.push(`Цель: ${goal.text} (с ${fmt(goal.setAt)})${last ? ` — ${goalRatingLabel(last.rating).toLowerCase()}` : ''}.`);
  }

  lines.push('');
  lines.push(`Занятий за 30 дней: ${recent.length}; всего: ${sessions.length}.`);

  const hard = new Map<string, number>();
  for (const s of recent) {
    for (const item of s.items) {
      if ((s.itemFeedback?.[item.exerciseId] ?? s.feedback) === 'hard') {
        hard.set(item.exerciseId, (hard.get(item.exerciseId) ?? 0) + 1);
      }
    }
  }
  if (hard.size > 0) {
    lines.push(
      'Давалось тяжело: ' +
        [...hard.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([id, n]) => `${title(id)} (${n})`)
          .join(', ') +
        '.',
    );
  }

  const painful = recent.filter((s) => s.pain);
  if (painful.length === 0) {
    lines.push('Боль или сильный дискомфорт: не отмечали.');
  } else {
    lines.push(`Боль или сильный дискомфорт: ${painful.length} раз.`);
    for (const s of painful) {
      const signs = (s.painSigns ?? []).map((id) => PAIN_SIGNS.find((p) => p.id === id)?.label.toLowerCase()).filter(Boolean);
      const area = PAIN_AREAS.find((a) => a.id === s.painArea)?.label.toLowerCase();
      const details = [signs.join(', '), area ? `где: ${area}` : ''].filter(Boolean).join('; ');
      lines.push(`  ${fmt(s.date)}${details ? ` — ${details}` : ''}`);
    }
  }

  const tested = TRACKING_TESTS.map((t) => ({ t, results: trackingResults.filter((r) => r.testId === t.id) })).filter(
    (x) => x.results.length > 0,
  );
  if (tested.length > 0) {
    lines.push('');
    lines.push('Тесты:');
    for (const { t, results } of tested) {
      const first = results[0];
      const last = results[results.length - 1];
      lines.push(
        results.length === 1
          ? `  ${t.title}: ${last.value} ${t.unit} (${fmt(last.date)})`
          : `  ${t.title}: ${first.value} → ${last.value} ${t.unit} (${fmt(first.date)} → ${fmt(last.date)})`,
      );
    }
  }

  return lines.join('\n');
}
