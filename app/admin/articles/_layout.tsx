import { Stack } from 'expo-router';

import { ADMIN, backHeader, sectionScreenOptions } from '@/src/admin/ui';

export default function ArticlesLayout() {
  return (
    <Stack screenOptions={sectionScreenOptions()}>
      <Stack.Screen name="index" options={{ title: 'Статьи' }} />
      <Stack.Screen name="edit" options={{ title: 'Статья', ...backHeader(ADMIN.articles) }} />
    </Stack>
  );
}
