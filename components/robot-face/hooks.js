import { useEffect, useState } from "react";

import {
  IDLE_EXPRESSIONS,
  REST_FACE_MOTION,
} from "@/components/robot-face/constants";

export function useFaceMotion(stage) {
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
          eyeX: (Math.random() - 0.5) * 5,
          eyeY: -1 - Math.random() * 2,
          browLift: -2 - Math.random() * 3,
          browTilt: (Math.random() - 0.5) * 5,
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

export function useIdleExpression(stage) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (stage !== "idle") {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setIndex((current) => (current + 1) % IDLE_EXPRESSIONS.length);
    }, 2800);

    return () => window.clearInterval(timerId);
  }, [stage]);

  return IDLE_EXPRESSIONS[index];
}
