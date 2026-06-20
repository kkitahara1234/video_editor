export const theme = {
  colors: {
    white: '#FFFFFF',
    black: '#000000',
    black50: 'rgba(0, 0, 0, 0.5)',
  },
  fonts: {
    telop: '"Tazugane Gothic StdN", "MT たづがね角ゴシック StdN", "TazuganeGothicStdN-Medium", "たづがね角ゴシック StdN Medium", "Noto Sans JP", sans-serif',
  },
  dimensions: { width: 1080, height: 1920, fps: 30 },

  logo: { height: 80, top: 40, left: 40 },

  camera: {
    leftRight: { x: 40, y: 0 },
    front: {
      x: 50, y: 0,
      transform: 'scale(1.4) translate(-3%, -10%)',
      transformOrigin: '50% 50%',
    },
  },

  telop: {
    bandBottom: 400,
    bandHeight: 110,
    fontSize: 56,
    fontWeight: 500 as const,
    horizontalPadding: 40,
    letterSpacing: '0.02em',
  },
};
