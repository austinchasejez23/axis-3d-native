import * as React from 'react';
import { cn } from '@/lib/utils';

const FALLBACK = '/media/92bec63fb_file_00000000a990820d8515bede88972084.png';

// Images are bundled/local. Do not request hosted image transformations.
const Image = React.forwardRef(function Image({
  src, fittingType = 'fill', originWidth, originHeight,
  focalPointX, focalPointY, className, style, onError, ...props
}, ref) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  const objectPosition = typeof focalPointX === 'number' && typeof focalPointY === 'number'
    ? String(focalPointX * 100) + '% ' + String(focalPointY * 100) + '%'
    : 'center';
  return (
    <img
      {...props}
      ref={ref}
      src={!failed && src ? src : FALLBACK}
      className={cn(className)}
      style={{
        objectFit: fittingType === 'fit' ? 'contain' : 'cover',
        objectPosition,
        ...(originWidth && originHeight ? { aspectRatio: String(originWidth) + ' / ' + String(originHeight) } : {}),
        ...style,
      }}
      onError={(event) => {
        if (!failed) setFailed(true);
        onError?.(event);
      }}
    />
  );
});
Image.displayName = 'Image';
export { Image };
