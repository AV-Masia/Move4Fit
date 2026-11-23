import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';

import { ADMIN_ACCESS } from '@/src/config';
import { Button, H1, Notice, P, Screen, colors, fs } from '@/src/ui/kit';

/**
 * Мягкий замок кабинета администратора.
 *
 * ⚠️ Это НЕ настоящая безопасность: сайт статический и публичный, пароль виден в коде,
 * проверка идёт на клиенте. Цель — не пускать случайных посетителей в кабинет. Настоящий
 * вход (сервер) нужен до появления реальных данных семей. См. ADMIN_ACCESS в src/config.ts.
 */

const KEY = 'move4fit/admin-unlocked/v1';

const Ctx = createContext<{ lock: () => void } | null>(null);

/** Доступно внутри кабинета: заблокировать его обратно (кнопка «выйти»). */
export function useAdminGate(): { lock: () => void } {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAdminGate must be used inside <AdminGate>');
  return v;
}

export function AdminGate({ children }: { children: ReactNode }) {
  const required = !!ADMIN_ACCESS.passcode;
  const [unlocked, setUnlocked] = useState(!required);
  const [ready, setReady] = useState(!required);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!required) return;
    let cancelled = false;
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (!cancelled && v === '1') setUnlocked(true);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [required]);

  const submit = () => {
    if (code === ADMIN_ACCESS.passcode) {
      setUnlocked(true);
      setError(false);
      setCode('');
      AsyncStorage.setItem(KEY, '1').catch(() => {});
    } else {
      setError(true);
    }
  };

  const lock = useCallback(() => {
    setUnlocked(false);
    setCode('');
    AsyncStorage.removeItem(KEY).catch(() => {});
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!unlocked) {
    return (
      <Screen>
        <H1>Кабинет администратора</H1>
        <P muted>Введите пароль кабинета. Это рабочая консоль куратора — не для родителей.</P>
        <TextInput
          accessibilityLabel="Пароль кабинета"
          value={code}
          onChangeText={(t) => {
            setCode(t);
            setError(false);
          }}
          onSubmitEditing={submit}
          placeholder="Пароль"
          placeholderTextColor={colors.muted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          style={{
            borderWidth: 2,
            borderColor: error ? colors.warn : colors.border,
            borderRadius: 14,
            paddingVertical: 12,
            paddingHorizontal: 14,
            fontSize: fs(16),
            color: colors.text,
            backgroundColor: colors.card,
          }}
        />
        {error && <Notice>Неверный пароль.</Notice>}
        <Button title="Войти" onPress={submit} disabled={!code.trim()} />
      </Screen>
    );
  }

  return <Ctx.Provider value={{ lock }}>{children}</Ctx.Provider>;
}
