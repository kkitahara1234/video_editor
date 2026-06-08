import { AbsoluteFill } from 'remotion';
import { theme } from '../theme';
import type { TelopData } from '../types';

type Props = {
  telops: TelopData[];
  currentSec: number;
};

export const Telop: React.FC<Props> = ({ telops, currentSec }) => {
  const active = telops.find(
    (t) => t.startSec <= currentSec && currentSec < t.endSec
  );

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute',
        bottom: theme.telop.bandBottom,
        left: 0,
        width: '100%',
        height: theme.telop.bandHeight,
        backgroundColor: theme.colors.black50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {active && (
          <span style={{
            fontFamily: theme.fonts.telop,
            color: theme.colors.white,
            fontSize: theme.telop.fontSize,
            fontWeight: theme.telop.fontWeight,
            textAlign: 'center',
            padding: `0 ${theme.telop.horizontalPadding}px`,
            letterSpacing: theme.telop.letterSpacing,
            whiteSpace: 'nowrap',
          }}>
            {active.text}
          </span>
        )}
      </div>
    </AbsoluteFill>
  );
};
