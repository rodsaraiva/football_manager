import { useFonts } from 'expo-font';

// Mapeia FONT_FAMILY → assets. Mantém os nomes em sincronia com FONT_FAMILY (tokens.ts).
// require() do asset de fonte é resolvido pelo bundler do Expo (metro/web).
// Manrope é OTF (estático só disponível em OTF); Saira Condensed é TTF.
const FONT_MAP = {
  Manrope: require('../../assets/fonts/Manrope-Regular.otf'),
  'Manrope-SemiBold': require('../../assets/fonts/Manrope-SemiBold.otf'),
  'Manrope-Bold': require('../../assets/fonts/Manrope-Bold.otf'),
  'Manrope-ExtraBold': require('../../assets/fonts/Manrope-ExtraBold.otf'),
  'SairaCondensed-SemiBold': require('../../assets/fonts/SairaCondensed-SemiBold.ttf'),
  'SairaCondensed-Bold': require('../../assets/fonts/SairaCondensed-Bold.ttf'),
};

// true quando as fontes carregaram OU falharam — em ambos os casos o app pode
// renderizar (fallback de sistema cobre a falha). Só segura o gate enquanto carrega.
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(FONT_MAP);
  return loaded || error != null;
}
