import { router } from 'expo-router';
import { useState } from 'react';

import { ROLE_LABELS, type ParentRole } from '@/src/domain/achievements';
import { useApp } from '@/src/state/AppState';
import { Button, Checkbox, Chip, ChipRow, Field, P, Screen } from '@/src/ui/kit';

/**
 * Регистрация. Сейчас — локальная заглушка: данные сохраняются только на этом устройстве.
 * TODO: подключить серверную авторизацию (вход по email-коду), см. README.
 */
export default function SignUp() {
  const { signUp } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ParentRole | null>(null);
  const [consent, setConsent] = useState(false);
  const valid = name.trim().length > 0 && /.+@.+\..+/.test(email.trim()) && consent;

  return (
    <Screen>
      <Field label="Как вас зовут" value={name} onChangeText={setName} autoComplete="name" />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <P muted>Кто вы ребёнку? (необязательно)</P>
      <ChipRow>
        {(Object.keys(ROLE_LABELS) as ParentRole[]).map((r) => (
          <Chip key={r} label={ROLE_LABELS[r]} selected={role === r} onPress={() => setRole(role === r ? null : r)} />
        ))}
      </ChipRow>
      <P muted>
        Сейчас все данные хранятся только на этом устройстве и никуда не отправляются. Email понадобится позже, чтобы
        сохранить прогресс и связаться с куратором.
      </P>
      <Checkbox
        label="Я согласен(на) на обработку данных о себе и о здоровье ребёнка для подбора занятий"
        checked={consent}
        onPress={() => setConsent(!consent)}
      />
      <Button
        title="Продолжить"
        disabled={!valid}
        onPress={() => {
          signUp({ name: name.trim(), email: email.trim(), consentAt: new Date().toISOString(), role: role ?? undefined });
          router.replace('/child/new');
        }}
      />
    </Screen>
  );
}
