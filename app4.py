"""실행: solara run app4.py --host localhost --port 8769"""

from mesa import Model
from mesa.datacollection import DataCollector
from mesa.discrete_space import CellAgent, OrthogonalMooreGrid
from mesa.visualization import (
    Slider,
    SolaraViz,
    SpaceRenderer,
    make_plot_component,
)
from mesa.visualization.components import AgentPortrayalStyle


COLORS = (
    "tab:blue",
    "tab:orange",
    "tab:green",
    "tab:purple",
    "tab:brown",
    "tab:pink",
    "tab:gray",
    "tab:olive",
    "tab:cyan",
)


class MovingDot(CellAgent):
    """주변 여덟 칸 중 하나로 무작위 이동하는 점입니다."""

    def __init__(self, model, color):
        super().__init__(model)
        self.color = color

    def step(self):
        self.move_to(self.cell.neighborhood.select_random_cell())


class RandomDotsModel(Model):
    def __init__(self, n=10):
        super().__init__()
        self.n = n
        self.meeting_count = 0
        self.grid = OrthogonalMooreGrid(
            (10, 10),
            torus=True,
            random=self.random,
        )

        # 시작할 때는 서로 다른 무작위 셀에 배치합니다.
        for index in range(n):
            dot = MovingDot(self, COLORS[index % len(COLORS)])
            dot.cell = self.grid.select_random_empty_cell()

        self.datacollector = DataCollector(
            model_reporters={"Meetings": "meeting_count"}
        )
        self.datacollector.collect(self)

    def step(self):
        self.agents.shuffle_do("step")

        # 같은 셀에 k개의 점이 있으면 kC2회의 만남으로 셉니다.
        meetings_this_step = sum(
            len(cell.agents) * (len(cell.agents) - 1) // 2
            for cell in self.grid.all_cells
        )
        self.meeting_count += meetings_this_step
        self.datacollector.collect(self)


def agent_portrayal(agent):
    is_meeting = len(agent.cell.agents) > 1
    return AgentPortrayalStyle(
        color="red" if is_meeting else agent.color,
        size=170 if is_meeting else 100,
    )


def style_meeting_plot(ax):
    ax.set_title("Cumulative meetings")
    ax.set_ylabel("Pair meetings")
    ax.grid(alpha=0.25)


model_params = {
    "n": Slider("점 개수", value=10, min=2, max=50, step=1),
}

model = RandomDotsModel()

renderer = SpaceRenderer(model, backend="matplotlib")
renderer.setup_agents(agent_portrayal)
renderer.render()

meeting_plot = make_plot_component(
    {"Meetings": "tab:red"},
    post_process=style_meeting_plot,
    backend="matplotlib",
)

page = SolaraViz(
    model,
    renderer,
    components=[meeting_plot],
    model_params=model_params,
    name="무작위로 움직이는 N개의 점",
)
