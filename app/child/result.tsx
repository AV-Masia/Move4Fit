import { router } from 'expo-router';

import { LEVEL_DESCRIPTIONS, LEVEL_GAP_WARNING, levelGap } from '@/src/domain/functionalLevel';
import { FLAG_LABELS, RISK_LABELS } from '@/src/domain/questionnaire';
import { useApp } from '@/src/state/AppState';
import { Button, Card, H1, Notice, P, Screen } from '@/src/ui/kit';

/** Результат: группа занятий простыми словами, откуда она взялась и что не будет предлагаться. */
export default function Result() {
  const { child, assessment, confirmDoctorClearance } = useApp();
  if (!child || !assessment) return null;
  const level = LEVEL_DESCRIPTIONS[assessment.level];
  const byDoctor = !!assessment.gmfcsReported && assessment.level !== assessment.computedLevel;

  return (
    <Screen>
      <H1>Профиль: {child.name}</H1>
      <Card>
        <P muted>Группа занятий</P>
        <H1>{level.title}</H1>
        <P>{level.text}</P>
        <P muted>
          {byDoctor
            ? `Группу выбрали по уровню, который назвал врач: он осторожнее, чем получилось по вашим ответам («${LEVEL_DESCRIPTIONS[assessment.computedLevel].title}»).`
            : 'Группу подобрали по вашим ответам.'}
        </P>
      </Card>
      {levelGap(assessment) >= LEVEL_GAP_WARNING && (
        <Notice>
          Ваши ответы и уровень от врача заметно расходятся. Пройдите вопросы ещё раз и проверьте ответы. Если врач оценивал
          давно — уточните уровень у него.
        </Notice>
      )}
      {assessment.excludedRisks.length > 0 && (
        <Notice>С учётом ответов не будем предлагать: {assessment.excludedRisks.map((r) => RISK_LABELS[r]).join(', ')}.</Notice>
      )}
      {assessment.unsureFlags.length > 0 && (
        <Notice>
          Уточните у врача: {assessment.unsureFlags.map((f) => FLAG_LABELS[f]).join(', ')}. Пока вы не ответите «да» или
          «нет», такие упражнения не предлагаем.
        </Notice>
      )}
      {assessment.clearanceRequired && !child.doctorClearanceConfirmed ? (
        <>
          <Notice>
            По вашим ответам перед началом занятий нужно получить разрешение лечащего врача. Покажите ему список упражнений
            или напишите куратору.
          </Notice>
          <Button title="Врач разрешил занятия" onPress={confirmDoctorClearance} />
          <Button title="Написать куратору" variant="secondary" onPress={() => router.replace('/(tabs)/support')} />
        </>
      ) : (
        <Button title="К занятиям" onPress={() => router.replace('/(tabs)')} />
      )}
      <Button title="Пройти вопросы заново" variant="secondary" onPress={() => router.replace('/child/questionnaire')} />
    </Screen>
  );
}
