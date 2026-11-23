import { router, Stack } from 'expo-router';

import { Button, H1, Screen } from '@/src/ui/kit';

export default function NotFoundScreen() {
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Не найдено' }} />
      <H1>Такой страницы нет.</H1>
      <Button title="На главную" onPress={() => router.replace('/')} />
    </Screen>
  );
}
