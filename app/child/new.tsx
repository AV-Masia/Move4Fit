import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ageFromParts, agePartsOf } from '@/src/domain/profile';
import { useApp } from '@/src/state/AppState';
import { Button, Chip, ChipRow, Field, P, Screen, defaultThemeFor } from '@/src/ui/kit';

const toInt = (s: string) => (s.trim() === '' ? 0 : Number(s));

/**
 * Профиль ребёнка: создание и (с параметром edit) изменение.
 * Диагноз здесь не спрашивается и нигде не хранится; свободного текстового поля тоже нет, чтобы диагноз
 * не оказался в нём. Что умеет ребёнок и что запретил врач, выясняется на следующих шагах.
 */
export default function ChildForm() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const { child, theme, setTheme, saveChild, updateChild } = useApp();
  // Тема на момент открытия формы — чтобы вернуть её, если родитель нажмёт «Отмена».
  const [initialTheme] = useState(theme);
  const editing = !!edit && !!child;
  const initialAge = editing ? agePartsOf(child.ageYears) : null;

  const [name, setName] = useState(editing ? child.name : '');
  const [years, setYears] = useState(initialAge ? String(initialAge.years) : '');
  const [months, setMonths] = useState(initialAge && initialAge.months > 0 ? String(initialAge.months) : '');
  const [sex, setSex] = useState<'girl' | 'boy' | undefined>(editing ? child.sex : undefined);

  const y = toInt(years);
  const m = toInt(months);
  const ageFilled = years.trim() !== '' || months.trim() !== '';
  const ageValid = ageFilled && Number.isInteger(y) && Number.isInteger(m) && y >= 0 && y <= 18 && m >= 0 && m <= 11 && y + m > 0;
  const valid = name.trim().length > 0 && ageValid;

  // Цвет оформления меняется сразу при выборе пола, чтобы было видно, как будет выглядеть приложение.
  const chooseSex = (value: 'girl' | 'boy' | undefined) => {
    setSex(value);
    setTheme(defaultThemeFor(value));
  };

  const save = () => {
    const data = {
      name: name.trim(),
      ageYears: ageFromParts(y, m),
      sex,
    };
    if (editing) {
      updateChild(data);
      router.back();
    } else {
      saveChild(data);
      router.replace('/child/questionnaire');
    }
  };

  return (
    <Screen>
      <Field label="Имя ребёнка" value={name} onChangeText={setName} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="Возраст: лет" value={years} onChangeText={setYears} keyboardType="number-pad" maxLength={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="и месяцев" value={months} onChangeText={setMonths} keyboardType="number-pad" maxLength={2} />
        </View>
      </View>
      {ageFilled && !ageValid && <P muted>Укажите возраст до 18 лет; месяцев — от 0 до 11.</P>}
      <P>Пол (необязательно)</P>
      <ChipRow>
        <Chip label="Девочка" selected={sex === 'girl'} onPress={() => chooseSex(sex === 'girl' ? undefined : 'girl')} />
        <Chip label="Мальчик" selected={sex === 'boy'} onPress={() => chooseSex(sex === 'boy' ? undefined : 'boy')} />
      </ChipRow>
      <P muted>Цвет оформления меняется сразу. В профиле его можно поменять на любой.</P>
      {!editing && (
        <P muted>Диагноз указывать не нужно: дальше мы спросим, что ребёнок умеет и что запретил врач.</P>
      )}
      {editing && <P muted>Группа занятий и подбор упражнений пересчитаются по вашим прежним ответам.</P>}
      <Button title={editing ? 'Сохранить' : 'Дальше'} disabled={!valid} onPress={save} />
      {editing && (
        <Button
          title="Отмена"
          variant="secondary"
          onPress={() => {
            setTheme(initialTheme);
            router.back();
          }}
        />
      )}
    </Screen>
  );
}
