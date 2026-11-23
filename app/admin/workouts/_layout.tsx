import { Stack } from 'expo-router';

import { ADMIN, backHeader, sectionScreenOptions } from '@/src/admin/ui';

export default function WorkoutsLayout() {
  return (
    <Stack screenOptions={sectionScreenOptions()}>
      <Stack.Screen name="index" options={{ title: 'Занятия' }} />
      <Stack.Screen name="edit" options={{ title: 'Занятие', ...backHeader(ADMIN.workouts) }} />
    </Stack>
  );
}
