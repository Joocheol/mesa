"""실행: solara run app3.py --host localhost --port 8768"""

from mesa import Model
from mesa.discrete_space import CellAgent, OrthogonalMooreGrid
from mesa.visualization import SolaraViz, SpaceRenderer
from mesa.visualization.components import AgentPortrayalStyle


class MovingDot(CellAgent):
    """주변 여덟 칸 중 하나를 무작위로 골라 이동하는 점입니다."""

    def __init__(self, model, color):
        super().__init__(model)
        self.color = color

    def step(self):
        self.move_to(self.cell.neighborhood.select_random_cell())


class TwoDotsModel(Model):
    def __init__(self):
        super().__init__()
        self.grid = OrthogonalMooreGrid(
            (10, 10),
            torus=True,
            capacity=2,
            random=self.random,
        )

        for position, color in [((3, 5), "tab:blue"), ((6, 5), "tab:orange")]:
            dot = MovingDot(self, color)
            dot.cell = self.grid[position]

    def step(self):
        self.agents.shuffle_do("step")


def agent_portrayal(agent):
    return AgentPortrayalStyle(color=agent.color, size=120)


model = TwoDotsModel()

renderer = SpaceRenderer(model, backend="matplotlib")
renderer.setup_agents(agent_portrayal)
renderer.render()

page = SolaraViz(model, renderer, name="무작위로 움직이는 두 점")
