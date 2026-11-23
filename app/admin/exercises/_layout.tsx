import { Stack } from 'expo-router';

import { ADMIN, backHeader, sectionScreenOptions } from '@/src/admin/ui';

export default function ExercisesLayout() {
  return (
    <Stack screenOptions={sectionScreenOptions()}>
      <Stack.Screen name="index" options={{ title: 'Упражнения' }} />
      <Stack.Screen name="edit" options={{ title: 'Упражнение', ...backHeader(ADMIN.exercises) }} />
    </Stack>
  );
}
