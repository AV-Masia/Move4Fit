import { useVideoPlayer, VideoView } from 'expo-video';
import { Text, View } from 'react-native';

import { colors } from './kit';

/** Видео упражнения. Пока ролики не сняты — показываем заглушку. */
export function ExerciseVideo({ url }: { url?: string }) {
  if (!url) {
    return (
      <View style={{ aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.muted }}>Видео скоро появится</Text>
      </View>
    );
  }
  return <Player url={url} />;
}

function Player({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
  });
  return <VideoView player={player} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12 }} nativeControls />;
}
