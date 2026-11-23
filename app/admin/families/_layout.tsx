import { Stack } from 'expo-router';

import { ADMIN, backHeader, sectionScreenOptions } from '@/src/admin/ui';

export default function FamiliesLayout() {
  return (
    <Stack screenOptions={sectionScreenOptions()}>
      <Stack.Screen name="index" options={{ title: 'Семьи' }} />
      <Stack.Screen name="[id]" options={{ title: 'Семья', ...backHeader(ADMIN.families) }} />
    </Stack>
  );
}
