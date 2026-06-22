import { useEffect, useState } from "react";

const REST_FACE_MOTION = {
  eyeX: 0,
  eyeY: 0,
  browLift: 0,
  browTilt: 0,
};
const PIXEL_SIZE = 9;
const PIXEL_GAP = 1;

function useFaceMotion(stage) {
  const [blinkLevel, setBlinkLevel] = useState(0);
  const [motion, setMotion] = useState(REST_FACE_MOTION);

  useEffect(() => {
    let cancelled = false;
    const timers = [];

    function schedule(callback, delay) {
      const timerId = window.setTimeout(() => {
        if (!cancelled) {
          callback();
        }
      }, delay);
      timers.push(timerId);
      return timerId;
    }

    function queueBlink() {
      const delay = stage === "speaking" ? 2200 : 3400 + Math.random() * 1800;
      schedule(() => {
        const roll = Math.random();

        if (roll < 0.18) {
          setBlinkLevel(1);
          schedule(() => {
            setBlinkLevel(0);
            schedule(() => {
              setBlinkLevel(1);
              schedule(() => {
                setBlinkLevel(0);
                queueBlink();
              }, 110);
            }, 90);
          }, 100);
          return;
        }

        if (roll < 0.34) {
          setBlinkLevel(0.45);
          schedule(() => {
            setBlinkLevel(1);
            schedule(() => {
              setBlinkLevel(0.45);
              schedule(() => {
                setBlinkLevel(0);
                queueBlink();
              }, 110);
            }, 180);
          }, 90);
          return;
        }

        setBlinkLevel(1);
        schedule(() => {
          setBlinkLevel(0);
          queueBlink();
        }, 140);
      }, delay);
    }

    queueBlink();

    return () => {
      cancelled = true;
      timers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [stage]);

  useEffect(() => {
    if (stage !== "speaking") {
      return undefined;
    }

    let beatTimer;
    let settleTimer;
    let cancelled = false;

    function queueBeat() {
      beatTimer = window.setTimeout(() => {
        if (cancelled) {
          return;
        }

        setMotion({
          eyeX: (Math.random() - 0.5) * 8,
          eyeY: -1 - Math.random() * 3,
          browLift: -4 - Math.random() * 5,
          browTilt: (Math.random() - 0.5) * 8,
        });

        settleTimer = window.setTimeout(() => {
          setMotion(REST_FACE_MOTION);
          queueBeat();
        }, 180);
      }, 900 + Math.random() * 1400);
    }

    queueBeat();

    return () => {
      cancelled = true;
      window.clearTimeout(beatTimer);
      window.clearTimeout(settleTimer);
    };
  }, [stage]);

  return {
    blinkLevel,
    motion: stage === "speaking" ? motion : REST_FACE_MOTION,
  };
}

function hashText(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 2147483647;
  }
  return hash;
}

function isCompliment(text) {
  return /\b(thank you|thanks|good job|great job|nice job|well done|awesome|amazing|love you|love this|love iripple|great work|nice work|beautiful|cool robot|smart robot)\b/i.test(
    String(text || ""),
  );
}

function shouldUseHeartEyes(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized || !isCompliment(normalized)) {
    return false;
  }

  return hashText(normalized) % 3 === 0;
}

function getFaceExpression({ mood, stage, reply, transcript }) {
  const unknownReply = /sorry, i don't know|cannot answer that|i only answer when|local booth knowledge/i.test(
    String(reply || "").toLowerCase(),
  );

  if (stage === "error" || unknownReply) {
    return "sad";
  }

  if (mood === "SURPRISED") {
    return "surprised";
  }

  if (stage === "processing" || mood === "THINKING") {
    return "thinking";
  }

  if (stage === "listening") {
    return "curious";
  }

  if (shouldUseHeartEyes(transcript)) {
    return "heart";
  }

  return "happy";
}

function Eye({ expression, side, blinkLevel, motion }) {
  const x = side === "left" ? 112 : 248;
  const sideOffset = side === "left" ? -1 : 1;
  const transform = `translate(${motion.eyeX + sideOffset * 1.5} ${motion.eyeY})`;

  if (blinkLevel >= 0.9) {
    return (
      <path
        d={`M${x - 23} 118 Q${x} 112 ${x + 23} 118`}
        stroke="#18302a"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
        transform={transform}
      />
    );
  }

  if (blinkLevel >= 0.35) {
    return (
      <ellipse
        cx={x}
        cy="118"
        rx="22"
        ry="7"
        fill="#18302a"
        opacity="0.85"
        transform={transform}
      />
    );
  }

  if (expression === "sad") {
    return side === "left" ? (
      <path
        d={`M${x - 22} 110 Q${x - 4} 124 ${x + 18} 122`}
        stroke="#18302a"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
        transform={transform}
      />
    ) : (
      <path
        d={`M${x - 18} 122 Q${x + 2} 124 ${x + 22} 110`}
        stroke="#18302a"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
        transform={transform}
      />
    );
  }

  if (expression === "curious") {
    return side === "left" ? (
      <path
        d={`M${x - 21} 110 Q${x - 2} 120 ${x + 18} 124`}
        stroke="#18302a"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
        transform={transform}
      />
    ) : (
      <>
        <ellipse
          cx={x}
          cy="118"
          rx="18"
          ry="21"
          fill="#18302a"
          transform={transform}
        />
        <circle
          cx={x - 2}
          cy="111"
          r="4"
          fill="#d7fff1"
          transform={transform}
        />
      </>
    );
  }

  if (expression === "thinking") {
    return (
      <path
        d={`M${x - 16} 105 C${x - 28} 105 ${x - 26} 128 ${x - 10} 128 C${x + 2} 128 ${x + 2} 112 ${x - 8} 112 C${x - 18} 112 ${x - 18} 121 ${x - 6} 121 C${x + 9} 121 ${x + 15} 102 ${x + 2} 102`}
        stroke="#18302a"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
        transform={transform}
      />
    );
  }

  if (expression === "surprised") {
    return side === "left" ? (
      <ellipse
        cx={x}
        cy="120"
        rx="22"
        ry="22"
        fill="#18302a"
        transform={transform}
      />
    ) : (
      <>
        <ellipse
          cx={x}
          cy="120"
          rx="22"
          ry="22"
          fill="#18302a"
          transform={transform}
        />
        <circle
          cx={x}
          cy="120"
          r="5"
          fill="#d7fff1"
          transform={transform}
        />
      </>
    );
  }

  if (expression === "heart") {
    return (
      <path
        d={`M${x} 129 C${x - 22} 116 ${x - 30} 100 ${x - 20} 92 C${x - 10} 84 ${x + 1} 92 ${x} 101 C${x - 1} 92 ${x + 10} 84 ${x + 20} 92 C${x + 30} 100 ${x + 22} 116 ${x} 129 Z`}
        fill="#18302a"
        transform={transform}
      />
    );
  }

  return (
    <>
      <path
        d={`M${x - 22} 122 Q${x} 96 ${x + 22} 122`}
        stroke="#18302a"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
        transform={transform}
      />
    </>
  );
}

function Brow({ expression, side, motion }) {
  const x1 = side === "left" ? 74 : 212;
  const x2 = side === "left" ? 148 : 286;
  const midpoint = (x1 + x2) / 2;
  const transform = `translate(0 ${motion.browLift}) rotate(${motion.browTilt * (side === "left" ? 0.6 : -0.6)} ${midpoint} 64)`;

  if (expression === "sad") {
    return (
      <path
        d={`M${x1} ${side === "left" ? 82 : 72} Q${midpoint} ${side === "left" ? 58 : 54} ${x2} ${side === "left" ? 68 : 84}`}
        stroke="#18302a"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
        opacity="0.84"
        transform={transform}
      />
    );
  }

  if (expression === "curious") {
    return (
      <path
        d={`M${x1} ${side === "left" ? 72 : 84} Q${midpoint} ${side === "left" ? 46 : 62} ${x2} ${side === "left" ? 82 : 68}`}
        stroke="#18302a"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
        opacity="0.82"
        transform={transform}
      />
    );
  }

  if (expression === "surprised") {
    return (
      <path
        d={`M${x1} 66 Q${midpoint} 40 ${x2} 66`}
        stroke="#18302a"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
        opacity="0.72"
        transform={transform}
      />
    );
  }

  if (expression === "thinking") {
    return (
      <path
        d={`M${x1} ${side === "left" ? 82 : 70} Q${midpoint} ${side === "left" ? 54 : 50} ${x2} ${side === "left" ? 70 : 82}`}
        stroke="#18302a"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
        opacity="0.84"
        transform={transform}
      />
    );
  }

  if (expression === "heart") {
    return (
      <path
        d={`M${x1} 70 Q${midpoint} 46 ${x2} 70`}
        stroke="#18302a"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
        opacity="0.62"
        transform={transform}
      />
    );
  }

  return (
    <path
      d={`M${x1} 74 Q${midpoint} 52 ${x2} 74`}
      stroke="#18302a"
      strokeWidth="10"
      strokeLinecap="round"
      fill="none"
      opacity="0.76"
      transform={transform}
    />
  );
}

function Mouth({ expression, mood, stage, mouthMotion }) {
  const openness = mouthMotion?.openness ?? 0.14;
  const width = mouthMotion?.width ?? 1;
  const smile = mouthMotion?.smile ?? 0.12;
  const lift = mouthMotion?.lift ?? 0;

  const centerX = 180;
  const leftX = centerX - 42 * width;
  const rightX = centerX + 42 * width;
  const topY = 198 + lift;
  const bottomY = topY + 18 + openness * 46;
  const controlY = bottomY + smile * 42;
  const upperLipY = topY + 3;
  const upperControlY = topY - 10 - smile * 18;

  if (expression === "sad" || stage === "error") {
    return (
      <path
        d={`M${leftX} ${topY + 16} Q${centerX} ${topY - 8} ${rightX} ${topY + 14}`}
        stroke="#18302a"
        strokeWidth="11"
        strokeLinecap="round"
        fill="none"
      />
    );
  }

  if (expression === "curious") {
    return (
      <path
        d={`M${leftX} ${topY + 6} Q${centerX} ${topY + 10} ${rightX} ${topY + 6}`}
        stroke="#18302a"
        strokeWidth="9"
        strokeLinecap="round"
        fill="none"
      />
    );
  }

  if (mood === "SURPRISED" && openness > 0.42) {
    return (
      <ellipse
        cx={centerX}
        cy={topY + 26}
        rx={18 + openness * 8}
        ry={24 + openness * 8}
        fill="none"
        stroke="#18302a"
        strokeWidth="11"
      />
    );
  }

  return (
    <>
      <path
        d={`M${leftX} ${topY} Q${centerX} ${controlY} ${rightX} ${topY}`}
        stroke="#18302a"
        strokeWidth="11"
        strokeLinecap="round"
        fill="none"
      />
      {expression === "happy" || expression === "heart" ? (
        <>
          <circle cx={leftX - 18} cy={topY - 6} r="3" fill="#18302a" opacity="0.18" />
          <circle cx={rightX + 18} cy={topY - 6} r="3" fill="#18302a" opacity="0.18" />
        </>
      ) : null}
      <path
        d={`M${leftX + 8} ${upperLipY} Q${centerX} ${upperControlY} ${rightX - 8} ${upperLipY}`}
        stroke="#18302a"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
        opacity="0.18"
      />
    </>
  );
}

function RoundedFaceScreen({
  mood,
  stage,
  mouthMotion,
  expression,
  blinkLevel,
  motion,
}) {
  return (
    <div className="rounded-[2.25rem] border border-[#406758]/18 bg-[#9ad2be] p-4 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.14),0_20px_50px_rgba(43,77,67,0.18)]">
      <div className="relative overflow-hidden rounded-[1.8rem] border border-[#426a5c]/18 bg-[#b8f0db] px-4 py-5">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.02))]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(255,255,255,0.4),transparent_30%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(to_bottom,rgba(24,48,42,0.08)_0px,rgba(24,48,42,0.08)_1px,transparent_1px,transparent_7px)] [background-size:100%_8px]" />

        <svg
          viewBox="0 0 360 280"
          className="relative h-[23rem] w-full sm:h-[28rem]"
          role="img"
          aria-hidden="true"
        >
          <Brow expression={expression} side="left" motion={motion} />
          <Brow expression={expression} side="right" motion={motion} />
          <Eye
            expression={expression}
            side="left"
            blinkLevel={blinkLevel}
            motion={motion}
          />
          <Eye
            expression={expression}
            side="right"
            blinkLevel={blinkLevel}
            motion={motion}
          />
          <Mouth
            expression={expression}
            mood={mood}
            stage={stage}
            mouthMotion={mouthMotion}
          />

          {expression === "happy" ? (
            <>
              <circle cx="92" cy="210" r="10" fill="#18302a" opacity="0.08" />
              <circle cx="268" cy="210" r="10" fill="#18302a" opacity="0.08" />
            </>
          ) : null}

          {expression === "sad" ? (
            <>
              <path
                d="M286 78 C297 68 306 74 304 90 C302 104 287 110 280 97 C275 89 278 82 286 78 Z"
                fill="#66b8d6"
                opacity="0.82"
              />
              <circle cx="104" cy="204" r="11" fill="#d78388" opacity="0.18" />
              <circle cx="256" cy="204" r="11" fill="#d78388" opacity="0.18" />
            </>
          ) : null}

          {expression === "thinking" ? (
            <path
              d="M178 152 Q188 146 198 152"
              stroke="#18302a"
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
              opacity="0.2"
            />
          ) : null}
        </svg>
      </div>
    </div>
  );
}

function PixelBlocks({ blocks, fill, opacity, transform }) {
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
  const x = side === "left" ? 88 : 224;

  if (blinkLevel >= 0.9) {
    return [{ x, y: 116, w: 48, h: 6 }];
  }

  if (blinkLevel >= 0.35) {
    return [{ x: x + 6, y: 112, w: 36, h: 12 }];
  }

  if (expression === "sad") {
    return side === "left"
      ? [
          { x: x + 4, y: 106, w: 12, h: 6 },
          { x: x + 16, y: 112, w: 12, h: 6 },
          { x: x + 28, y: 118, w: 12, h: 6 },
        ]
      : [
          { x: x + 4, y: 118, w: 12, h: 6 },
          { x: x + 16, y: 112, w: 12, h: 6 },
          { x: x + 28, y: 106, w: 12, h: 6 },
        ];
  }

  if (expression === "curious") {
    return side === "left"
      ? [
          { x: x + 2, y: 106, w: 12, h: 6 },
          { x: x + 14, y: 112, w: 12, h: 6 },
          { x: x + 26, y: 118, w: 12, h: 6 },
        ]
      : [
          { x: x + 6, y: 98, w: 30, h: 24 },
          { x: x + 18, y: 104, w: 6, h: 6, fill: "#dadada" },
        ];
  }

  if (expression === "surprised") {
    return [
      { x: x + 8, y: 96, w: 24, h: 30 },
      { x: x + 14, y: 102, w: 12, h: 18, fill: "#dadada" },
    ];
  }

  if (expression === "thinking") {
    return [
      { x: x + 6, y: 98, w: 12, h: 6 },
      { x: x + 18, y: 98, w: 12, h: 6 },
      { x: x + 6, y: 104, w: 6, h: 12 },
      { x: x + 24, y: 104, w: 6, h: 12 },
      { x: x + 12, y: 116, w: 12, h: 6 },
      { x: x + 12, y: 104, w: 12, h: 6 },
    ];
  }

  if (expression === "heart") {
    return [
      { x: x + 6, y: 100, w: 12, h: 12 },
      { x: x + 24, y: 100, w: 12, h: 12 },
      { x: x + 12, y: 112, w: 18, h: 12 },
      { x: x + 18, y: 124, w: 6, h: 6 },
    ];
  }

  return [
    { x: x + 4, y: 116, w: 12, h: 6 },
    { x: x + 16, y: 104, w: 12, h: 6 },
    { x: x + 28, y: 116, w: 12, h: 6 },
  ];
}

function getPixelBrowBlocks(expression, side) {
  const x = side === "left" ? 76 : 212;

  if (expression === "sad") {
    return side === "left"
      ? [
          { x, y: 80, w: 16, h: 8 },
          { x: x + 12, y: 72, w: 16, h: 8 },
          { x: x + 24, y: 64, w: 16, h: 8 },
          { x: x + 36, y: 60, w: 20, h: 8 },
        ]
      : [
          { x, y: 60, w: 20, h: 8 },
          { x: x + 16, y: 64, w: 16, h: 8 },
          { x: x + 28, y: 72, w: 16, h: 8 },
          { x: x + 40, y: 80, w: 16, h: 8 },
        ];
  }

  if (expression === "curious") {
    return side === "left"
      ? [
          { x, y: 68, w: 16, h: 8 },
          { x: x + 12, y: 60, w: 16, h: 8 },
          { x: x + 24, y: 52, w: 16, h: 8 },
          { x: x + 36, y: 60, w: 20, h: 8 },
        ]
      : [
          { x, y: 76, w: 20, h: 8 },
          { x: x + 16, y: 68, w: 16, h: 8 },
          { x: x + 28, y: 60, w: 16, h: 8 },
          { x: x + 40, y: 64, w: 16, h: 8 },
        ];
  }

  if (expression === "surprised") {
    return [
      { x, y: 56, w: 20, h: 8 },
      { x: x + 16, y: 48, w: 16, h: 8 },
      { x: x + 28, y: 44, w: 16, h: 8 },
      { x: x + 40, y: 48, w: 16, h: 8 },
    ];
  }

  if (expression === "thinking") {
    return side === "left"
      ? [
          { x, y: 76, w: 16, h: 8 },
          { x: x + 12, y: 68, w: 16, h: 8 },
          { x: x + 24, y: 60, w: 16, h: 8 },
          { x: x + 36, y: 60, w: 20, h: 8 },
        ]
      : [
          { x, y: 60, w: 20, h: 8 },
          { x: x + 16, y: 60, w: 16, h: 8 },
          { x: x + 28, y: 68, w: 16, h: 8 },
          { x: x + 40, y: 76, w: 16, h: 8 },
        ];
  }

  if (expression === "heart") {
    return [
      { x, y: 64, w: 20, h: 8 },
      { x: x + 16, y: 56, w: 16, h: 8 },
      { x: x + 28, y: 56, w: 16, h: 8 },
      { x: x + 40, y: 64, w: 16, h: 8 },
    ];
  }

  return [
    { x, y: 68, w: 20, h: 8 },
    { x: x + 16, y: 60, w: 16, h: 8 },
    { x: x + 28, y: 56, w: 16, h: 8 },
    { x: x + 40, y: 60, w: 16, h: 8 },
  ];
}

function getPixelMouthBlocks(expression, mood, stage, mouthMotion) {
  const openness = mouthMotion?.openness ?? 0.14;

  if (expression === "sad" || stage === "error") {
    return [
      { x: 132, y: 216, w: 20, h: 8 },
      { x: 148, y: 208, w: 16, h: 8 },
      { x: 164, y: 204, w: 32, h: 8 },
      { x: 196, y: 208, w: 16, h: 8 },
      { x: 212, y: 216, w: 20, h: 8 },
    ];
  }

  if (expression === "curious") {
    return [
      { x: 140, y: 210, w: 18, h: 6 },
      { x: 158, y: 214, w: 18, h: 6 },
      { x: 176, y: 214, w: 18, h: 6 },
      { x: 194, y: 210, w: 18, h: 6 },
    ];
  }

  if (mood === "SURPRISED" && openness > 0.42) {
    return [
      { x: 168, y: 202, w: 18, h: 24 },
      { x: 162, y: 208, w: 30, h: 12, fill: "#dadada" },
    ];
  }

  if (openness > 0.45) {
    return [
      { x: 132, y: 196, w: 20, h: 8 },
      { x: 148, y: 204, w: 16, h: 8 },
      { x: 164, y: 212, w: 32, h: 24 },
      { x: 196, y: 204, w: 16, h: 8 },
      { x: 212, y: 196, w: 20, h: 8 },
    ];
  }

  return [
    { x: 132, y: 200, w: 20, h: 8 },
    { x: 148, y: 208, w: 20, h: 8 },
    { x: 168, y: 216, w: 24, h: 8 },
    { x: 192, y: 208, w: 20, h: 8 },
    { x: 212, y: 200, w: 20, h: 8 },
  ];
}

function PixelFaceScreen({
  mood,
  stage,
  mouthMotion,
  expression,
  blinkLevel,
  motion,
}) {
  const leftEyeTransform = `translate(${Math.round((motion.eyeX - 2) / 3) * 3} ${Math.round(motion.eyeY / 3) * 3})`;
  const rightEyeTransform = `translate(${Math.round((motion.eyeX + 2) / 3) * 3} ${Math.round(motion.eyeY / 3) * 3})`;
  const browTransform = `translate(0 ${Math.round(motion.browLift / 4) * 4})`;

  return (
    <div className="rounded-[1.4rem] border border-[#777777]/28 bg-[#adadad] p-4 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.12),0_20px_50px_rgba(70,70,70,0.2)]">
      <div className="relative overflow-hidden rounded-[0.95rem] border border-[#7d7d7d]/36 bg-[#d8d8d8] px-4 py-5">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(247,247,247,0.72)_1px,transparent_1px),linear-gradient(rgba(247,247,247,0.72)_1px,transparent_1px)] [background-size:14px_14px]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(255,255,255,0.32),transparent_28%)]" />

        <svg
          viewBox="0 0 360 280"
          className="relative h-[23rem] w-full sm:h-[28rem]"
          role="img"
          aria-hidden="true"
          shapeRendering="crispEdges"
        >
          <PixelBlocks
            blocks={getPixelBrowBlocks(expression, "left")}
            fill="#494949"
            transform={browTransform}
          />
          <PixelBlocks
            blocks={getPixelBrowBlocks(expression, "right")}
            fill="#494949"
            transform={browTransform}
          />
          <PixelBlocks
            blocks={getPixelEyeBlocks(expression, "left", blinkLevel)}
            fill="#494949"
            transform={leftEyeTransform}
          />
          <PixelBlocks
            blocks={getPixelEyeBlocks(expression, "right", blinkLevel)}
            fill="#494949"
            transform={rightEyeTransform}
          />
          <PixelBlocks
            blocks={getPixelMouthBlocks(expression, mood, stage, mouthMotion)}
            fill="#494949"
          />

          {expression === "happy" ? (
            <>
              <PixelBlocks
                blocks={[
                  { x: 84, y: 208, w: 12, h: 12, opacity: 0.12 },
                  { x: 260, y: 208, w: 12, h: 12, opacity: 0.12 },
                ]}
                fill="#494949"
              />
              <PixelBlocks
                blocks={[
                  { x: 72, y: 96, w: 6, h: 6, opacity: 0.18 },
                  { x: 76, y: 88, w: 6, h: 6, opacity: 0.18 },
                  { x: 82, y: 96, w: 6, h: 6, opacity: 0.18 },
                  { x: 278, y: 96, w: 6, h: 6, opacity: 0.18 },
                  { x: 284, y: 88, w: 6, h: 6, opacity: 0.18 },
                  { x: 290, y: 96, w: 6, h: 6, opacity: 0.18 },
                ]}
                fill="#494949"
              />
            </>
          ) : null}

          {expression === "sad" ? (
            <>
              <PixelBlocks
                blocks={[
                  { x: 284, y: 72, w: 16, h: 8, fill: "#90a8b4" },
                  { x: 292, y: 80, w: 16, h: 16, fill: "#90a8b4" },
                  { x: 288, y: 96, w: 8, h: 8, fill: "#90a8b4" },
                ]}
              />
              <PixelBlocks
                blocks={[
                  { x: 96, y: 200, w: 16, h: 16, opacity: 0.16 },
                  { x: 248, y: 200, w: 16, h: 16, opacity: 0.16 },
                ]}
                fill="#8a7476"
              />
            </>
          ) : null}

          {expression === "thinking" ? (
            <PixelBlocks
              blocks={[
                { x: 172, y: 148, w: 8, h: 8, opacity: 0.24 },
                { x: 180, y: 144, w: 8, h: 8, opacity: 0.24 },
                { x: 188, y: 148, w: 8, h: 8, opacity: 0.24 },
              ]}
              fill="#494949"
            />
          ) : null}
        </svg>
      </div>
    </div>
  );
}

function FaceScreen(props) {
  if (props.faceStyle === "pixelized") {
    return <PixelFaceScreen {...props} />;
  }

  return <RoundedFaceScreen {...props} />;
}

function DebugPanel({ title, children, className = "" }) {
  return (
    <div className={`debug-panel ${className}`}>
      <p className="text-[0.7rem] uppercase tracking-[0.34em] text-[#4f7b6d]/85">
        {title}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function RobotFace({
  debugMode,
  mood,
  transcript,
  reply,
  timings,
  stage,
  error,
  mouthMotion,
  faceStyle,
  useFillerSpeech,
  onToggleFaceStyle,
  onToggleFillerSpeech,
}) {
  const expression = getFaceExpression({ mood, stage, reply, transcript });
  const { blinkLevel, motion } = useFaceMotion(stage);

  const stageLabel = {
    idle: "Ready for the next booth visitor",
    listening: "Listening on the arcade button channel",
    processing: "Checking the local booth brain",
    speaking: "Talking through the local speaker rig",
    error: "The offline booth stack needs attention",
  }[stage];

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,#d6efe3_0%,#9ecbb9_35%,#5f8f7f_100%)] px-4 py-8 text-[#1a2f29]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.38),transparent_34%)]" />
      <div className="scanlines pointer-events-none absolute inset-0 opacity-20" />

      <div className="pointer-events-none absolute inset-x-6 top-5 flex items-center justify-between text-[0.65rem] uppercase tracking-[0.4em] text-[#335c50]/70">
        <span>iripple-robot</span>
      </div>

      <section className="relative z-10 flex w-full max-w-3xl items-center justify-center">
        <div className="w-full">
          <FaceScreen
            mood={mood}
            stage={stage}
            mouthMotion={mouthMotion}
            expression={expression}
            blinkLevel={blinkLevel}
            motion={motion}
            faceStyle={faceStyle}
          />
        </div>
      </section>

      {debugMode ? (
        <>
          <div className="pointer-events-none absolute left-4 top-20 z-20 w-[18rem] max-w-[calc(100vw-2rem)]">
            <DebugPanel title="Status">
              <p className="font-mono text-sm leading-6 text-[#17342c]">
                {stageLabel}
              </p>
              <p className="mt-4 text-xs leading-5 text-[#33594d]/80">
                Hold the physical arcade button mapped to Spacebar to talk.
              </p>
            </DebugPanel>
          </div>

          <div className="pointer-events-none absolute right-4 top-20 z-20 w-[20rem] max-w-[calc(100vw-2rem)]">
            <DebugPanel title="Conversation">
              <p className="min-h-6 font-mono text-sm leading-6 text-[#41665a]">
                {transcript ? `Visitor: ${transcript}` : "Visitor: ..."}
              </p>
              <p className="mt-3 min-h-12 font-mono text-base leading-7 text-[#17342c]">
                {reply || "[HAPPY] Ready for the next curious attendee."}
              </p>
              {error ? (
                <p className="mt-3 text-xs leading-5 text-[#8e533e]">
                  {error}
                </p>
              ) : null}
            </DebugPanel>
          </div>

          <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 flex w-[min(92vw,38rem)] -translate-x-1/2 gap-3">
            <DebugPanel title="Debug" className="flex-1">
              <p className="text-sm leading-6 text-[#214238]">
                Friendly monochrome kiosk mode with local chunked speech playback.
              </p>
              {timings ? (
                <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-[0.68rem] leading-5 text-[#33594d]">
                  {JSON.stringify(timings, null, 2)}
                </pre>
              ) : null}
            </DebugPanel>
            <div className="debug-panel flex flex-1 flex-col justify-center gap-3 text-[0.65rem] uppercase tracking-[0.32em] text-[#4b7868]/80">
              <div className="flex flex-wrap items-center justify-center gap-3">
                <span className="rounded-full border border-[#4c7768]/18 bg-[#effbf5]/58 px-3 py-2">
                  Offline
                </span>
                <span className="rounded-full border border-[#4c7768]/18 bg-[#effbf5]/58 px-3 py-2">
                  Sarah Voice
                </span>
                <span className="rounded-full border border-[#4c7768]/18 bg-[#effbf5]/58 px-3 py-2">
                  {faceStyle === "pixelized" ? "Pixelized Face" : "Rounded Face"}
                </span>
              </div>
              <button
                type="button"
                onClick={onToggleFaceStyle}
                className={`pointer-events-auto rounded-2xl border px-4 py-3 text-[0.68rem] font-semibold tracking-[0.26em] transition ${
                  faceStyle === "pixelized"
                    ? "border-[#325b4d] bg-[#dff6eb] text-[#17342c]"
                    : "border-[#4c7768]/18 bg-[#effbf5]/58 text-[#4b7868]"
                }`}
              >
                Face Style {faceStyle === "pixelized" ? "Pixelized" : "Rounded"}
              </button>
              <button
                type="button"
                onClick={onToggleFillerSpeech}
                className={`pointer-events-auto rounded-2xl border px-4 py-3 text-[0.68rem] font-semibold tracking-[0.26em] transition ${
                  useFillerSpeech
                    ? "border-[#325b4d] bg-[#dff6eb] text-[#17342c]"
                    : "border-[#4c7768]/18 bg-[#effbf5]/58 text-[#4b7868]"
                }`}
              >
                Filler Phrase {useFillerSpeech ? "On" : "Off"}
              </button>
              <span className="text-center text-[0.6rem] tracking-[0.22em] text-[#4b7868]/70">
                Default: off
              </span>
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
