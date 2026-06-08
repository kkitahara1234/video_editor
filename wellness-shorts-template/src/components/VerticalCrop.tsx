import React from 'react';

type Props = {
  offsetX: number;  // 0 = 左端を見る, 100 = 右端を見る (%換算)
  offsetY: number;  // 縦方向(基本0)
  children: React.ReactNode;
};

// 1920x1080 横素材を 1080x1920 縦に表示
// children(video等) に object-fit: cover を当てて、object-position で位置調整
export const VerticalCrop: React.FC<Props> = ({ offsetX, offsetY, children }) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: 1080,
        height: 1920,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          // 子要素(video)に object-fit を適用させる
        }}
      >
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            const el = child as React.ReactElement<{ style?: React.CSSProperties }>;
            return React.cloneElement(el, {
              style: {
                ...(el.props.style || {}),
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: `${offsetX}% ${offsetY}%`,
              },
            });
          }
          return child;
        })}
      </div>
    </div>
  );
};
