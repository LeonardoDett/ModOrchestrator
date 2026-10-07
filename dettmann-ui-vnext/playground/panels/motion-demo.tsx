import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Inline,
  MOTION_LEVELS,
  MotionScope,
  Presence,
  SegmentedControl,
  Stack,
  Typography,
  animate,
  useFlip,
  useMotion,
  type MotionLevel,
} from "../../src";
import { MOTION_LABELS } from "./theme-editor";

/** Botão + marcador que desliza na mola do nível efetivo do escopo; `tick` dispara de fora. */
function LevelLane({ requested, tick }: { requested: MotionLevel; tick: number }) {
  const { level, spec } = useMotion();
  const marker = useRef<HTMLDivElement>(null);
  const far = useRef(false);
  const running = useRef<Animation | null>(null);

  // FLIP: a posição final vai para o estilo; a animação só percorre o deslocamento.
  // Sob redução de movimento `animate` descarta o transform e o marcador salta.
  const move = () => {
    const el = marker.current;
    if (!el) return;
    far.current = !far.current;
    const before = el.getBoundingClientRect().left;
    running.current?.cancel();
    el.style.left = far.current ? "calc(100% - var(--marker-size))" : "0px";
    const delta = before - el.getBoundingClientRect().left;
    running.current = animate(el, [{ transform: `translateX(${delta}px)` }, { transform: "translateX(0px)" }]);
  };

  const seenTick = useRef(tick);
  useEffect(() => {
    if (seenTick.current === tick) return;
    seenTick.current = tick;
    move();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return (
    <Stack gap="sm" className="rounded-card border border-border bg-surface p-3">
      <Inline justify="between" wrap={false}>
        <Typography variant="label" color="fg">
          {MOTION_LABELS[requested]}
        </Typography>
        {level !== requested ? (
          <Badge size="sm" intent="warning">
            limitado a {MOTION_LABELS[level].toLowerCase()}
          </Badge>
        ) : null}
      </Inline>
      <div className="relative h-8 rounded-control bg-sunken [--marker-size:2rem]">
        <div ref={marker} className="absolute top-0 left-0 size-(--marker-size) rounded-control bg-emphasis-fill" />
      </div>
      <Button size="sm" motion={level} onClick={move}>
        Mover
      </Button>
      <Typography variant="caption" className="font-mono text-fg-subtle">
        k {spec.stiffness} · c {spec.damping} · amp {spec.amplitude} · toque {spec.pressScale}
      </Typography>
    </Stack>
  );
}

const INITIAL = ["SKSE64", "SkyUI", "USSEP", "RaceMenu", "Immersive Armors", "Alternate Start"];

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function FlipList() {
  const [items, setItems] = useState(INITIAL);
  const flip = useFlip<HTMLLIElement>([items]);
  return (
    <Stack gap="sm">
      <Inline gap="sm">
        <Button size="sm" onClick={() => setItems(shuffle)}>
          Embaralhar
        </Button>
        <Button size="sm" emphasis="low" onClick={() => setItems((v) => [...v].reverse())}>
          Inverter
        </Button>
      </Inline>
      <ol className="flex flex-col gap-1">
        {items.map((name, i) => (
          <li
            key={name}
            ref={flip(name)}
            className="flex items-center gap-3 rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg"
          >
            <span className="w-5 font-mono text-caption text-fg-subtle tabular-nums">{i + 1}</span>
            {name}
          </li>
        ))}
      </ol>
    </Stack>
  );
}

function PresenceDemo() {
  const [show, setShow] = useState(true);
  return (
    <Stack gap="sm">
      <Inline gap="sm">
        <Button size="sm" onClick={() => setShow((v) => !v)}>
          {show ? "Ocultar aviso" : "Mostrar aviso"}
        </Button>
      </Inline>
      <div className="min-h-20">
        <Presence show={show}>
          <div>
            <Alert.Root variant="success" role="status">
              <Alert.Title>Mod instalado</Alert.Title>
              <Alert.Description>SkyUI 5.2 entrou na ordem de mods.</Alert.Description>
            </Alert.Root>
          </div>
        </Presence>
      </div>
    </Stack>
  );
}

const LEVEL_OPTIONS = MOTION_LEVELS.map((value) => ({ value, label: MOTION_LABELS[value] }));

/** Três níveis lado a lado e as primitivas (`useFlip`, `Presence`) num nível escolhido. */
export function MotionDemo() {
  const [tick, setTick] = useState(0);
  const [listLevel, setListLevel] = useState<MotionLevel>("responsive");
  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Inline justify="between">
          <Typography variant="body-sm" color="muted-fg">
            O mesmo componente sob <code className="font-mono">MotionScope</code> calmo, responsivo e expressivo.
          </Typography>
          <Button size="sm" emphasis="low" onClick={() => setTick((t) => t + 1)}>
            Mover os três
          </Button>
        </Inline>
        <div className="grid grid-cols-3 gap-3">
          {MOTION_LEVELS.map((level) => (
            <MotionScope key={level} level={level}>
              <LevelLane requested={level} tick={tick} />
            </MotionScope>
          ))}
        </div>
      </Stack>
      <Stack gap="sm">
        <Inline gap="sm">
          <Typography variant="label" color="fg" id="motion-list-level">
            Nível das primitivas
          </Typography>
          <SegmentedControl aria-labelledby="motion-list-level" size="sm" options={LEVEL_OPTIONS} value={listLevel} onChange={setListLevel} />
        </Inline>
        <MotionScope level={listLevel}>
          <div className="grid grid-cols-2 gap-4">
            <Stack gap="xs">
              <Typography variant="caption" className="font-semibold text-fg-muted">
                Reordenação (useFlip)
              </Typography>
              <FlipList />
            </Stack>
            <Stack gap="xs">
              <Typography variant="caption" className="font-semibold text-fg-muted">
                Entrada e saída (Presence)
              </Typography>
              <PresenceDemo />
            </Stack>
          </div>
        </MotionScope>
      </Stack>
    </Stack>
  );
}
