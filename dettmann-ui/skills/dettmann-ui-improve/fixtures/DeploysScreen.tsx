// Fixture da skill dettmann-ui-improve: tela de projeto consumidor com problemas
// plantados para os cenários de teste. NÃO é código da lib nem exemplo a seguir.
import { useState } from "react";
import { Boxes, Rocket, Server } from "lucide-react";
import { Button, Card, Icon, Toolbar, Typography } from "dettmann-ui";

interface Deploy {
  id: string;
  name: string;
}

export function DeploysScreen({ initial }: { initial: Deploy[] }) {
  const [deploys, setDeploys] = useState(initial);
  const services = 12;
  const servers = 4;

  const remove = (id: string) => setDeploys((list) => list.filter((d) => d.id !== id));

  return (
    <div className="bg-[#1e293b] rounded-[10px] p-6">
      <Toolbar
        start={<Typography variant="heading-5">Deploys</Typography>}
        end={
          <>
            <Button emphasis="high">Novo deploy</Button>
            <Button emphasis="high" intent="success">Implantar tudo</Button>
          </>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <div className="flex items-center gap-2">
          <Icon icon={Rocket} />
          <Typography variant="label">Deploys</Typography>
          <span className="ml-auto text-fg-muted">{deploys.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <Icon icon={Boxes} />
          <Typography variant="label">Serviços</Typography>
          <span className="ml-auto text-fg-muted">{services}</span>
        </div>
        <div className="flex items-center gap-2">
          <Icon icon={Server} />
          <Typography variant="label">Servidores</Typography>
          <span className="ml-auto text-fg-muted">{servers}</span>
        </div>
      </div>

      <Card.Root>
        <Card.Body>
          <ul>
            {deploys.map((d) => (
              <li key={d.id} className="flex items-center justify-between transition-all duration-300 hover:bg-state-hover">
                <Typography>{d.name}</Typography>
                <Button emphasis="low" intent="danger" onClick={() => remove(d.id)}>
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        </Card.Body>
      </Card.Root>
    </div>
  );
}
