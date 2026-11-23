import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { TRACKING_TESTS } from '@/src/domain/exercises';
import { useApp } from '@/src/state/AppState';
import { Button, Card, Field, H1, P, Screen } from '@/src/ui/kit';

export default function TrackingTestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { addTrackingResult } = useApp();
  const [value, setValue] = useState('');
  const test = TRACKING_TESTS.find((t) => t.id === id);
  if (!test) return null;
  const num = Number(value.replace(',', '.'));

  return (
    <Screen>
      <H1>{test.title}</H1>
      <Card>
        <P>{test.instructions}</P>
      </Card>
      <Field label={`Результат (${test.unit})`} value={value} onChangeText={setValue} keyboardType="decimal-pad" />
      <Button
        title="Сохранить"
        disabled={!Number.isFinite(num) || num < 0 || num > 100000 || value.trim() === ''}
        onPress={() => {
          addTrackingResult(test.id, num);
          router.back();
        }}
      />
    </Screen>
  );
}
