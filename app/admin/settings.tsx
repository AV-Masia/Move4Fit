import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Share } from 'react-native';

import { applyImport, exportText, hasImportBackup, lastExportedAt, loadContent, saveSupport, undoImport } from '@/src/admin/content';
import { useAdminGate } from '@/src/admin/gate';
import { EMPTY_SUPPORT, parseBackup, planImport, validateSupport, type ImportPlan, type SupportContacts } from '@/src/domain/library';
import { Button, Card, Field, H2, Notice, P, Screen } from '@/src/ui/kit';

const fmt = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** В браузере — скачать файл; в приложении — системное «Поделиться» с текстом файла. */
async function deliver(text: string) {
  if (Platform.OS !== 'web') {
    await Share.share({ message: text });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `move4fit-content-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Выбор файла в браузере. Возвращает текст файла или null, если выбор отменён. */
function pickFileText(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then(resolve, reject);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Раздел «Настройки»: контакты куратора, выгрузка содержания в файл и загрузка из файла. */
export default function AdminSettings() {
  const { lock } = useAdminGate();
  const [support, setSupport] = useState<SupportContacts | null>(null);
  const [failed, setFailed] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [exportedAt, setExportedAt] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [pasted, setPasted] = useState('');
  const [plan, setPlan] = useState<(ImportPlan & { skipped: number }) | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([loadContent(), lastExportedAt(), hasImportBackup()])
      .then(([c, at, undo]) => {
        setSupport(c.support);
        setExportedAt(at);
        setCanUndo(undo);
      })
      .catch(() => setFailed(true));
  }, []);
  useFocusEffect(load);

  const attempt = async (action: () => Promise<void>, done: string, fail: string) => {
    try {
      await action();
      setMessage(done);
      load();
    } catch {
      setMessage(fail);
    }
  };

  const saveContacts = () => {
    if (!support) return;
    const clean: SupportContacts = {
      telegram: support.telegram.trim().replace(/^@/, ''),
      whatsapp: support.whatsapp.replace(/\D/g, ''),
      email: support.email.trim(),
      communityUrl: support.communityUrl.trim(),
    };
    const found = validateSupport(clean);
    setErrors(found);
    if (found.length > 0) return;
    void attempt(() => saveSupport(clean), 'Контакты сохранены.', 'Не удалось сохранить контакты. Попробуйте ещё раз.');
  };

  const preview = async (text: string | null) => {
    setMessage('');
    setPlan(null);
    if (!text?.trim()) return;
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      setMessage(parsed.error);
      return;
    }
    try {
      const { localVideos: _skip, ...current } = await loadContent();
      setPlan({ ...planImport(current, parsed.doc), skipped: parsed.skipped });
    } catch {
      setMessage('Не удалось прочитать текущее содержание. Попробуйте ещё раз.');
    }
  };

  const chooseFile = async () => {
    try {
      await preview(await pickFileText());
    } catch {
      setMessage('Не удалось прочитать файл.');
    }
  };

  if (failed) {
    return (
      <Screen>
        <Notice>Не удалось прочитать настройки.</Notice>
        <Button title="Повторить" variant="secondary" onPress={load} />
      </Screen>
    );
  }
  if (!support) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }

  const set = (patch: Partial<SupportContacts>) => setSupport({ ...(support ?? EMPTY_SUPPORT), ...patch });

  return (
    <Screen>
      {!!message && <Notice>{message}</Notice>}

      <Card>
        <H2>Выгрузка в файл</H2>
        <P muted>
          Всё, что вы изменили и создали (упражнения, занятия, статьи, цели, контакты), лежит только в этом браузере или
          телефоне и пропадёт, если очистить его данные. Выгружайте файл после каждой большой правки — его же можно
          передать разработчику или специалисту. Данных о семьях и видеофайлов в нём нет.
        </P>
        <P>{exportedAt ? `Последняя выгрузка: ${fmt(exportedAt)}` : 'Вы ещё ни разу не выгружали файл.'}</P>
        <Button
          title={Platform.OS === 'web' ? 'Скачать файл' : 'Выгрузить'}
          onPress={() => attempt(async () => deliver(await exportText()), 'Файл выгружен.', 'Не удалось выгрузить файл. Попробуйте ещё раз.')}
        />
      </Card>

      <Card>
        <H2>Загрузка из файла</H2>
        <P muted>
          Записи из файла добавляются к вашим, а совпадающие по коду — заменяются. Остальное не меняется. Перед загрузкой
          вы увидите, что изменится.
        </P>
        {Platform.OS === 'web' ? (
          <Button title="Выбрать файл" variant="secondary" onPress={chooseFile} />
        ) : (
          <>
            <Field
              label="Вставьте сюда текст файла"
              value={pasted}
              onChangeText={setPasted}
              multiline
              autoCapitalize="none"
              style={{ minHeight: 110, textAlignVertical: 'top' }}
            />
            <Button title="Проверить" variant="secondary" disabled={!pasted.trim()} onPress={() => preview(pasted)} />
          </>
        )}
        {plan && (
          <>
            <P>
              Будет добавлено: {plan.added}. Заменено: {plan.changed}. Без изменений: {plan.same}.
              {plan.skipped > 0 ? ` Пропущено из-за ошибок в файле: ${plan.skipped}.` : ''}
            </P>
            {plan.changed > 0 && <P muted>У заменённых записей отметка о проверке специалистом снимается.</P>}
            {plan.added + plan.changed === 0 ? (
              <P muted>Загружать нечего: всё из файла у вас уже есть.</P>
            ) : (
              <Button
                title="Загрузить"
                onPress={() => {
                  const doc = plan.doc;
                  setPlan(null);
                  setPasted('');
                  void attempt(() => applyImport(doc), 'Файл загружен. Если что-то не так, загрузку можно отменить.', 'Не удалось загрузить файл. Ничего не изменилось.');
                }}
              />
            )}
            <Button title="Отмена" variant="secondary" onPress={() => setPlan(null)} />
          </>
        )}
        {canUndo && !plan && (
          <Button
            title="Отменить последнюю загрузку"
            variant="secondary"
            onPress={() => attempt(undoImport, 'Содержание возвращено к состоянию до загрузки.', 'Не удалось отменить загрузку.')}
          />
        )}
      </Card>

      <Card>
        <H2>Контакты куратора</H2>
        <P muted>
          По этим контактам родители пишут куратору. Сейчас значения только сохраняются здесь и попадают в файл выгрузки:
          в приложении родителей они появятся после подключения сервера или когда разработчик перенесёт их в приложение.
        </P>
        <Field label="Telegram (имя без @)" value={support.telegram} onChangeText={(telegram) => set({ telegram })} autoCapitalize="none" />
        <Field label="WhatsApp (номер, только цифры)" value={support.whatsapp} onChangeText={(whatsapp) => set({ whatsapp })} keyboardType="phone-pad" />
        <Field label="Почта" value={support.email} onChangeText={(email) => set({ email })} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Ссылка на чат родителей" value={support.communityUrl} onChangeText={(communityUrl) => set({ communityUrl })} autoCapitalize="none" keyboardType="url" placeholder="https://" />
        {errors.length > 0 && <Notice>{errors.join('\n')}</Notice>}
        <Button title="Сохранить контакты" onPress={saveContacts} />
      </Card>

      <Card>
        <H2>Доступ в кабинет</H2>
        <P muted>
          Заблокирует кабинет на этом устройстве — в следующий раз снова спросит пароль. Это мягкая защита от случайного
          захода, а не полноценный вход (он появится вместе с сервером).
        </P>
        <Button title="Заблокировать кабинет" variant="secondary" onPress={lock} />
      </Card>
    </Screen>
  );
}
