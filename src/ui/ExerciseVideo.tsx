import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { colors, fs } from './kit';

/**
 * Видео упражнения. Безопасные умолчания для всех: никакого автозапуска, никакого принудительного полного
 * экрана, никакого обратного отсчёта, без зацикливания. Запуск, пауза, «Сначала» и полный экран — только по кнопкам.
 */
export function ExerciseVideo({ url }: { url?: string }) {
  const [started, setStarted] = useState(false);
  if (!url) {
    return (
      <Frame>
        <Text style={{ color: colors.muted, fontSize: fs(16) }}>Видео скоро появится</Text>
      </Frame>
    );
  }
  if (!started) {
    return (
      <Frame>
        <VideoButton title="▶ Смотреть видео" label="Смотреть видео" onPress={() => setStarted(true)} primary />
      </Frame>
    );
  }
  return <Player url={url} />;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12 }}>
      {children}
    </View>
  );
}

function VideoButton({ title, label, onPress, primary }: { title: string; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        minWidth: 48,
        paddingHorizontal: 16,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: primary ? colors.primary : colors.card,
        borderWidth: 2,
        borderColor: primary ? colors.primary : colors.border,
        opacity: pressed ? 0.85 : 1,
      })}>
      <Text style={{ fontSize: fs(16), fontWeight: '700', color: primary ? colors.card : colors.text }}>{title}</Text>
    </Pressable>
  );
}

function Player({ url }: { url: string }) {
  // Смена key пересоздаёт плеер — так работает «Повторить» после ошибки загрузки.
  const [attempt, setAttempt] = useState(0);
  return <ActivePlayer key={attempt} url={url} onRetry={() => setAttempt(attempt + 1)} />;
}

function ActivePlayer({ url, onRetry }: { url: string; onRetry: () => void }) {
  const viewRef = useRef<VideoView>(null);
  // Запуск — прямое действие родителя («Смотреть видео»), поэтому play() здесь не автозапуск.
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  if (status === 'error') {
    return (
      <Frame>
        <Text accessibilityRole="alert" style={{ color: colors.text, fontSize: fs(16), fontWeight: '700', textAlign: 'center' }}>
          Видео не загрузилось. Повторить?
        </Text>
        <VideoButton title="Повторить" label="Повторить загрузку видео" onPress={onRetry} primary />
      </Frame>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <VideoView
        ref={viewRef}
        player={player}
        style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12 }}
        nativeControls={false}
        fullscreenOptions={{ enable: true }}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <VideoButton
          title={isPlaying ? '⏸ Пауза' : '▶ Продолжить'}
          label={isPlaying ? 'Поставить видео на паузу' : 'Продолжить воспроизведение видео'}
          onPress={() => (isPlaying ? player.pause() : player.play())}
        />
        <VideoButton title="⟲ Сначала" label="Смотреть видео сначала" onPress={() => player.replay()} />
        <VideoButton title="⤢ На весь экран" label="Открыть видео на весь экран" onPress={() => viewRef.current?.enterFullscreen()} />
      </View>
    </View>
  );
}
