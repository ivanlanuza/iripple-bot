import {
  HEART_FILL,
  HEART_STROKE,
  MOUTH_DARK,
  MOUTH_LIGHT,
  MOUTH_TONGUE,
  OUTLINE_COLOR,
} from "@/components/robot-face/constants";

function ThinkingIndicator({ isThinking }) {
  if (!isThinking) {
    return null;
  }

  return (
    <g aria-hidden="true" fill="white" opacity="0.58">
      <g>
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 180 57"
          to="360 180 57"
          dur="1.25s"
          repeatCount="indefinite"
        />
        <circle cx="180" cy="42" r="2.7" />
        <circle cx="191" cy="47" r="2.7" />
        <circle cx="195" cy="57" r="2.7" />
        <circle cx="191" cy="68" r="2.7" />
        <circle cx="180" cy="72" r="2.7" />
        <circle cx="169" cy="68" r="2.7" />
        <circle cx="165" cy="57" r="2.7" />
        <circle cx="169" cy="47" r="2.7" />
      </g>
    </g>
  );
}

function HeartEye({ x, y, transform }) {
  return (
    <path
      d={`M${x} ${y + 17} C${x - 13} ${y + 9} ${x - 18} ${y - 1} ${x - 12} ${y - 6} C${x - 7} ${y - 10} ${x - 1} ${y - 6} ${x} ${y} C${x + 1} ${y - 6} ${x + 7} ${y - 10} ${x + 12} ${y - 6} C${x + 18} ${y - 1} ${x + 13} ${y + 9} ${x} ${y + 17} Z`}
      fill={HEART_FILL}
      stroke={HEART_STROKE}
      strokeWidth="3"
      strokeLinejoin="round"
      transform={transform}
    />
  );
}

function SparkleEye({ x, transform }) {
  return (
    <path
      d={`M${x} 88 V114 M${x - 10} 101 H${x + 10} M${x - 6} 94 L${x + 6} 108 M${x + 6} 94 L${x - 6} 108`}
      fill="none"
      stroke={OUTLINE_COLOR}
      strokeWidth="3.5"
      strokeLinecap="round"
      transform={transform}
    />
  );
}

function Eye({ expression, side, blinkLevel, motion }) {
  const x = side === "left" ? 106 : 254;
  const sideOffset = side === "left" ? -1 : 1;
  const transform = `translate(${motion.eyeX + sideOffset} ${motion.eyeY})`;

  if (blinkLevel >= 0.9) {
    return (
      <path
        d={`M${x - 11} 108 H${x + 11}`}
        stroke={OUTLINE_COLOR}
        strokeWidth="5"
        strokeLinecap="round"
        transform={transform}
      />
    );
  }

  if (blinkLevel >= 0.35) {
    return (
      <ellipse
        cx={x}
        cy="108"
        rx="10"
        ry="5"
        fill={OUTLINE_COLOR}
        transform={transform}
      />
    );
  }

  if (expression === "heartEyes") {
    return <HeartEye x={x} y={94} transform={transform} />;
  }

  if (expression === "sparkle") {
    return <SparkleEye x={x} transform={transform} />;
  }

  if (expression === "kawaii") {
    return (
      <g transform={transform}>
        <circle cx={x} cy="108" r="8" fill={OUTLINE_COLOR} />
        <circle cx={x + 2.5} cy="105.5" r="2.25" fill="white" />
      </g>
    );
  }

  return <circle cx={x} cy="108" r="7.5" fill={OUTLINE_COLOR} transform={transform} />;
}

function Brow({ expression, side, motion }) {
  if (!["thinking", "curious", "mad", "apologetic"].includes(expression)) {
    return null;
  }

  const isLeft = side === "left";
  const midpoint = isLeft ? 107 : 253;
  const transform = `translate(0 ${motion.browLift}) rotate(${motion.browTilt * (isLeft ? 0.55 : -0.55)} ${midpoint} 76)`;

  if (expression === "thinking") {
    return isLeft ? (
      <path
        d="M83 86 Q96 82 108 74"
        stroke={OUTLINE_COLOR}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        transform={transform}
      />
    ) : (
      <path
        d="M241 76 H265"
        stroke={OUTLINE_COLOR}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        transform={transform}
      />
    );
  }

  if (expression === "curious") {
    return isLeft ? (
      <path
        d="M83 84 Q96 76 108 80"
        stroke={OUTLINE_COLOR}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        transform={transform}
      />
    ) : (
      <path
        d="M242 80 Q254 76 267 84"
        stroke={OUTLINE_COLOR}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        transform={transform}
      />
    );
  }

  if (expression === "mad") {
    return isLeft ? (
      <path
        d="M83 78 L107 90"
        stroke={OUTLINE_COLOR}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        transform={transform}
      />
    ) : (
      <path
        d="M241 90 L265 78"
        stroke={OUTLINE_COLOR}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        transform={transform}
      />
    );
  }

  return isLeft ? (
    <path
      d="M83 84 Q95 72 108 80"
      stroke={OUTLINE_COLOR}
      strokeWidth="5"
      strokeLinecap="round"
      fill="none"
      transform={transform}
    />
  ) : (
    <path
      d="M242 80 Q255 72 267 84"
      stroke={OUTLINE_COLOR}
      strokeWidth="5"
      strokeLinecap="round"
      fill="none"
      transform={transform}
    />
  );
}

function HappyMouth({ mouthMotion }) {
  const openness = mouthMotion?.openness ?? 0.14;
  const width = mouthMotion?.width ?? 1;
  const lift = mouthMotion?.lift ?? 0;
  const smile = mouthMotion?.smile ?? 0.18;
  const centerX = 180;
  const topY = 141 + lift;
  const halfWidth = 30 * Math.max(0.78, Math.min(1.16, width));
  const lipDepth = 12;
  const bottomY = topY + 26 + openness * 26 + Math.max(0, smile) * 4;
  const teethHeight = 12;
  const lowerY = topY + lipDepth;

  return (
    <>
      <path
        d={`M${centerX - halfWidth} ${topY} H${centerX + halfWidth} V${lowerY} C${centerX + halfWidth} ${bottomY - 4} ${centerX + halfWidth * 0.42} ${bottomY} ${centerX} ${bottomY} C${centerX - halfWidth * 0.42} ${bottomY} ${centerX - halfWidth} ${bottomY - 4} ${centerX - halfWidth} ${lowerY} Z`}
        fill={MOUTH_DARK}
        stroke={OUTLINE_COLOR}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <rect
        x={centerX - halfWidth + 4}
        y={topY + 4}
        width={halfWidth * 2 - 8}
        height={teethHeight}
        fill={MOUTH_LIGHT}
        stroke={OUTLINE_COLOR}
        strokeWidth="1.5"
      />
      <path
        d={`M${centerX - halfWidth + 5} ${bottomY - 8} C${centerX - halfWidth * 0.25} ${bottomY - 18} ${centerX + halfWidth * 0.25} ${bottomY - 18} ${centerX + halfWidth - 5} ${bottomY - 8} C${centerX + halfWidth * 0.3} ${bottomY + 2} ${centerX - halfWidth * 0.3} ${bottomY + 2} ${centerX - halfWidth + 5} ${bottomY - 8} Z`}
        fill={MOUTH_TONGUE}
        opacity="0.92"
      />
    </>
  );
}

function OvalMouth({ mouthMotion, size = "curious" }) {
  const openness = mouthMotion?.openness ?? 0.14;
  const lift = mouthMotion?.lift ?? 0;
  const cx = 180;
  const cy = size === "surprised" ? 156 + lift * 0.4 : 171 + lift * 0.4;
  const rxBase = size === "surprised" ? 16 : 10;
  const ryBase = size === "surprised" ? 22 : 13;
  const rx = rxBase + openness * (size === "surprised" ? 5 : 3);
  const ry = ryBase + openness * (size === "surprised" ? 8 : 5);

  return (
    <>
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill={MOUTH_DARK}
        stroke={OUTLINE_COLOR}
        strokeWidth="4"
      />
      <path
        d={`M${cx - rx + 4} ${cy + ry * 0.36} C${cx - rx * 0.28} ${cy + ry * 0.05} ${cx + rx * 0.28} ${cy + ry * 0.05} ${cx + rx - 4} ${cy + ry * 0.36} C${cx + rx * 0.28} ${cy + ry * 0.68} ${cx - rx * 0.28} ${cy + ry * 0.68} ${cx - rx + 4} ${cy + ry * 0.36} Z`}
        fill={MOUTH_TONGUE}
        opacity="0.9"
      />
    </>
  );
}

function ThinkingMouth({ mouthMotion, stage }) {
  const openness = mouthMotion?.openness ?? 0.14;
  const speaking = stage === "speaking";
  const width = 42 + openness * 10;
  const height = speaking ? 4 + openness * 7 : 4;

  return (
    <rect
      x={180 - width / 2}
      y="154"
      width={width}
      height={height}
      rx="2.5"
      fill={OUTLINE_COLOR}
    />
  );
}

function FrownMouth({ expression, mouthMotion, stage }) {
  const openness = mouthMotion?.openness ?? 0.14;
  const speaking = stage === "speaking";
  const width =
    expression === "mad" ? 46 : expression === "sad" ? 42 : 36;
  const baseY = expression === "sad" ? 171 : 170;
  const controlY = expression === "mad" ? 152 : expression === "sad" ? 154 : 156;

  if (!speaking) {
    return (
      <path
        d={`M${180 - width} ${baseY} Q180 ${controlY} ${180 + width} ${baseY}`}
        stroke={OUTLINE_COLOR}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
    );
  }

  const lowerY = baseY + 8 + openness * 12;
  const lowerControlY = controlY + 12 + openness * 6;

  return (
    <>
      <path
        d={`M${180 - width} ${baseY} Q180 ${controlY} ${180 + width} ${baseY}`}
        stroke={OUTLINE_COLOR}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={`M${180 - width + 5} ${baseY + 2} Q180 ${controlY + 4} ${180 + width - 5} ${baseY + 2} L${180 + width - 7} ${lowerY} Q180 ${lowerControlY} ${180 - width + 7} ${lowerY} Z`}
        fill={MOUTH_DARK}
        stroke={OUTLINE_COLOR}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </>
  );
}

function Mouth({ expression, stage, mouthMotion }) {
  if (["happy", "heartEyes", "kawaii", "sparkle"].includes(expression)) {
    return <HappyMouth mouthMotion={mouthMotion} />;
  }

  if (expression === "surprised") {
    return <OvalMouth mouthMotion={mouthMotion} size="surprised" />;
  }

  if (expression === "curious") {
    return <OvalMouth mouthMotion={mouthMotion} size="curious" />;
  }

  if (expression === "thinking") {
    return <ThinkingMouth mouthMotion={mouthMotion} stage={stage} />;
  }

  return <FrownMouth expression={expression} mouthMotion={mouthMotion} stage={stage} />;
}

function CuteCheeks({ expression }) {
  if (!["heartEyes", "kawaii", "sparkle"].includes(expression)) {
    return null;
  }

  return (
    <g fill={HEART_FILL} opacity="0.45">
      <ellipse cx="75" cy="140" rx="13" ry="5" />
      <ellipse cx="285" cy="140" rx="13" ry="5" />
    </g>
  );
}

export function RoundedFaceScreen({
  stage,
  mouthMotion,
  expression,
  blinkLevel,
  motion,
  isThinking,
}) {
  return (
    <div className="rounded-[2.4rem] p-5">
      <svg viewBox="0 0 360 250" className="h-[33.6rem] w-full sm:h-[40.6rem]" role="img" aria-hidden="true">
        <rect
          x="4"
          y="5"
          width="352"
          height="240"
          rx="28"
          fill="transparent"
        />

        <g transform="translate(180 125) scale(1.32 1.56) translate(-180 -120)">
          <ThinkingIndicator isThinking={isThinking} />
          <Brow expression={expression} side="left" motion={motion} />
          <Brow expression={expression} side="right" motion={motion} />
          <Eye expression={expression} side="left" blinkLevel={blinkLevel} motion={motion} />
          <Eye expression={expression} side="right" blinkLevel={blinkLevel} motion={motion} />
          <CuteCheeks expression={expression} />
          <Mouth expression={expression} stage={stage} mouthMotion={mouthMotion} />
        </g>
      </svg>
    </div>
  );
}
