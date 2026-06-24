import {
  FACE_LIGHT,
  HEART_FILL,
  MOUTH_DARK,
  MOUTH_LIGHT,
  MOUTH_TONGUE,
  OUTLINE_COLOR,
  PIXEL_GAP,
  PIXEL_SIZE,
} from "@/components/robot-face/constants";

function PixelBlocks({ blocks, fill = OUTLINE_COLOR, opacity = 1, transform }) {
  return blocks.flatMap((block, index) => {
    const columns = Math.max(1, Math.round(block.w / PIXEL_SIZE));
    const rows = Math.max(1, Math.round(block.h / PIXEL_SIZE));
    const squares = [];

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        squares.push(
          <rect
            key={`${block.x}-${block.y}-${block.w}-${block.h}-${index}-${row}-${column}`}
            x={block.x + column * PIXEL_SIZE}
            y={block.y + row * PIXEL_SIZE}
            width={PIXEL_SIZE - PIXEL_GAP}
            height={PIXEL_SIZE - PIXEL_GAP}
            fill={block.fill || fill}
            opacity={block.opacity ?? opacity}
            transform={transform}
          />,
        );
      }
    }

    return squares;
  });
}

function getPixelEyeBlocks(expression, side, blinkLevel) {
  const x = side === "left" ? 90 : 234;

  if (blinkLevel >= 0.9) {
    return [{ x, y: 104, w: 24, h: 6 }];
  }

  if (blinkLevel >= 0.35) {
    return [{ x, y: 102, w: 18, h: 9 }];
  }

  if (expression === "heartEyes") {
    return [
      { x, y: 88, w: 9, h: 9, fill: HEART_FILL },
      { x: x + 18, y: 88, w: 9, h: 9, fill: HEART_FILL },
      { x: x + 9, y: 97, w: 18, h: 9, fill: HEART_FILL },
      { x: x + 18, y: 106, w: 9, h: 9, fill: HEART_FILL },
    ];
  }

  return [{ x: x + 9, y: 99, w: 9, h: 9 }];
}

function getPixelBrowBlocks(expression, side) {
  const x = side === "left" ? 81 : 234;

  if (expression === "thinking") {
    return side === "left"
      ? [
          { x, y: 72, w: 9, h: 9 },
          { x: x + 9, y: 72, w: 9, h: 9 },
          { x: x + 18, y: 63, w: 9, h: 9 },
        ]
      : [
          { x, y: 63, w: 9, h: 9 },
          { x: x + 9, y: 63, w: 9, h: 9 },
          { x: x + 18, y: 63, w: 9, h: 9 },
        ];
  }

  if (expression === "curious") {
    return side === "left"
      ? [
          { x, y: 72, w: 9, h: 9 },
          { x: x + 9, y: 63, w: 9, h: 9 },
          { x: x + 18, y: 63, w: 9, h: 9 },
        ]
      : [
          { x, y: 63, w: 9, h: 9 },
          { x: x + 9, y: 63, w: 9, h: 9 },
          { x: x + 18, y: 72, w: 9, h: 9 },
        ];
  }

  if (expression === "mad") {
    return side === "left"
      ? [
          { x, y: 63, w: 9, h: 9 },
          { x: x + 9, y: 72, w: 9, h: 9 },
          { x: x + 18, y: 81, w: 9, h: 9 },
        ]
      : [
          { x, y: 81, w: 9, h: 9 },
          { x: x + 9, y: 72, w: 9, h: 9 },
          { x: x + 18, y: 63, w: 9, h: 9 },
        ];
  }

  if (expression === "apologetic") {
    return side === "left"
      ? [
          { x, y: 81, w: 9, h: 9 },
          { x: x + 9, y: 72, w: 9, h: 9 },
          { x: x + 18, y: 72, w: 9, h: 9 },
        ]
      : [
          { x, y: 72, w: 9, h: 9 },
          { x: x + 9, y: 72, w: 9, h: 9 },
          { x: x + 18, y: 81, w: 9, h: 9 },
        ];
  }

  return [];
}

function getPixelHappyMouthBlocks(mouthMotion) {
  const openness = mouthMotion?.openness ?? 0.14;
  const widthScale = Math.max(0.86, Math.min(1.12, mouthMotion?.width ?? 1));
  const halfWidth = Math.round((24 * widthScale) / 9) * 9;
  const openHeight = 18 + Math.round(openness * 18);
  const left = 180 - halfWidth;

  return [
    { x: left, y: 140, w: halfWidth * 2, h: 9, fill: MOUTH_LIGHT },
    { x: left, y: 149, w: halfWidth * 2, h: openHeight, fill: MOUTH_DARK },
    {
      x: left + 9,
      y: 149 + openHeight - 9,
      w: Math.max(18, halfWidth * 2 - 18),
      h: 9,
      fill: MOUTH_TONGUE,
    },
  ];
}

function getPixelOvalMouthBlocks(mouthMotion, size = "curious") {
  const openness = mouthMotion?.openness ?? 0.14;
  const x = 171;
  const y = size === "surprised" ? 135 : 156;
  const width = size === "surprised" ? 18 : 9;
  const height = size === "surprised" ? 36 : 18 + Math.round(openness * 9);

  return [
    { x, y, w: width, h: 9, fill: MOUTH_DARK },
    { x: x - 9, y: y + 9, w: width + 18, h: height - 9, fill: MOUTH_DARK },
    { x, y: y + height - 9, w: width, h: 9, fill: MOUTH_TONGUE },
  ];
}

function getPixelThinkingMouthBlocks(mouthMotion, stage) {
  const openness = mouthMotion?.openness ?? 0.14;
  const height = stage === "speaking" ? 9 + Math.round(openness * 6) : 9;

  return [{ x: 162, y: 153, w: 45, h: height }];
}

function getPixelFrownBlocks(expression, mouthMotion, stage) {
  const openness = mouthMotion?.openness ?? 0.14;
  const speaking = stage === "speaking";

  if (expression === "mad") {
    return speaking
      ? [
          { x: 135, y: 162, w: 18, h: 9 },
          { x: 153, y: 153, w: 18, h: 9 },
          { x: 171, y: 153, w: 18, h: 9 },
          { x: 189, y: 153, w: 18, h: 9 },
          { x: 207, y: 162, w: 18, h: 9 },
          { x: 144, y: 171, w: 72, h: 9 + Math.round(openness * 9), fill: MOUTH_DARK },
        ]
      : [
          { x: 135, y: 162, w: 18, h: 9 },
          { x: 153, y: 153, w: 18, h: 9 },
          { x: 171, y: 153, w: 18, h: 9 },
          { x: 189, y: 153, w: 18, h: 9 },
          { x: 207, y: 162, w: 18, h: 9 },
        ];
  }

  if (expression === "sad") {
    return speaking
      ? [
          { x: 144, y: 162, w: 18, h: 9 },
          { x: 162, y: 153, w: 18, h: 9 },
          { x: 180, y: 153, w: 18, h: 9 },
          { x: 198, y: 162, w: 18, h: 9 },
          { x: 153, y: 171, w: 54, h: 9 + Math.round(openness * 9), fill: MOUTH_DARK },
        ]
      : [
          { x: 144, y: 162, w: 18, h: 9 },
          { x: 162, y: 153, w: 18, h: 9 },
          { x: 180, y: 153, w: 18, h: 9 },
          { x: 198, y: 162, w: 18, h: 9 },
        ];
  }

  return speaking
    ? [
        { x: 153, y: 162, w: 18, h: 9 },
        { x: 171, y: 153, w: 18, h: 9 },
        { x: 189, y: 162, w: 18, h: 9 },
        { x: 162, y: 171, w: 36, h: 9 + Math.round(openness * 9), fill: MOUTH_DARK },
      ]
    : [
        { x: 153, y: 162, w: 18, h: 9 },
        { x: 171, y: 153, w: 18, h: 9 },
        { x: 189, y: 162, w: 18, h: 9 },
      ];
}

function getPixelMouthBlocks(expression, stage, mouthMotion) {
  if (expression === "happy" || expression === "heartEyes") {
    return getPixelHappyMouthBlocks(mouthMotion);
  }

  if (expression === "surprised") {
    return getPixelOvalMouthBlocks(mouthMotion, "surprised");
  }

  if (expression === "curious") {
    return getPixelOvalMouthBlocks(mouthMotion, "curious");
  }

  if (expression === "thinking") {
    return getPixelThinkingMouthBlocks(mouthMotion, stage);
  }

  return getPixelFrownBlocks(expression, mouthMotion, stage);
}

export function PixelFaceScreen({
  stage,
  mouthMotion,
  expression,
  blinkLevel,
  motion,
}) {
  const leftEyeTransform = `translate(${Math.round((motion.eyeX - 1) / 3) * 3} ${Math.round(motion.eyeY / 3) * 3})`;
  const rightEyeTransform = `translate(${Math.round((motion.eyeX + 1) / 3) * 3} ${Math.round(motion.eyeY / 3) * 3})`;
  const leftBrowTransform = `translate(0 ${Math.round(motion.browLift / 4) * 4})`;
  const rightBrowTransform = `translate(0 ${Math.round(motion.browLift / 4) * 4})`;

  return (
    <div className="rounded-[1.8rem] border border-[#6c6c6c]/28 bg-[#d3d8d2] p-5 shadow-[0_30px_70px_rgba(50,50,50,0.18)]">
      <svg
        viewBox="0 0 360 250"
        className="h-[24rem] w-full sm:h-[29rem]"
        role="img"
        aria-hidden="true"
        shapeRendering="crispEdges"
      >
        <rect
          x="20"
          y="20"
          width="320"
          height="200"
          rx="24"
          fill={FACE_LIGHT}
          stroke="#262626"
          strokeWidth="5"
        />

        <PixelBlocks blocks={getPixelBrowBlocks(expression, "left")} transform={leftBrowTransform} />
        <PixelBlocks blocks={getPixelBrowBlocks(expression, "right")} transform={rightBrowTransform} />
        <PixelBlocks blocks={getPixelEyeBlocks(expression, "left", blinkLevel)} transform={leftEyeTransform} />
        <PixelBlocks blocks={getPixelEyeBlocks(expression, "right", blinkLevel)} transform={rightEyeTransform} />
        <PixelBlocks blocks={getPixelMouthBlocks(expression, stage, mouthMotion)} />
      </svg>
    </div>
  );
}
