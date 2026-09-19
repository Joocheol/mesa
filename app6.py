"""실행: solara run app6.py --host localhost --port 8771"""

from math import comb, exp, pi, sqrt

import solara
from matplotlib.figure import Figure
from mesa import Agent, Model
from mesa.visualization import Slider, SolaraViz
from mesa.visualization.utils import update_counter


class Ball(Agent):
    """골턴 보드에서 스스로 좌우 이동하는 Mesa 에이전트입니다."""

    def __init__(self, model):
        super().__init__(model)
        self.row = 0
        self.right_moves = 0

    @property
    def x(self):
        return self.right_moves - self.row / 2

    def step(self):
        if self.random.random() < 0.5:
            self.right_moves += 1
        self.row += 1

        if self.row == self.model.rows:
            self.model.landing_counts[self.right_moves] += 1
            self.model.completed += 1
            self.remove()


class GaltonBoardModel(Model):
    def __init__(self, n_balls=1000, rows=12, balls_per_step=10):
        super().__init__()
        self.n_balls = n_balls
        self.rows = rows
        self.balls_per_step = balls_per_step
        self.launched = 0
        self.completed = 0
        self.landing_counts = [0] * (rows + 1)

    def step(self):
        launch_count = min(
            self.balls_per_step,
            self.n_balls - self.launched,
        )
        for _ in range(launch_count):
            Ball(self)
        self.launched += launch_count

        self.agents.shuffle_do("step")
        if self.completed == self.n_balls:
            self.running = False


@solara.component
def plot_board(model):
    update_counter.get()
    fig = Figure(figsize=(7, 5))
    ax = fig.subplots()

    peg_x = []
    peg_y = []
    for row in range(model.rows):
        for position in range(row + 1):
            peg_x.append(position - row / 2)
            peg_y.append(row)

    ax.scatter(peg_x, peg_y, s=12, color="dimgray", zorder=1)
    if len(model.agents) > 0:
        ax.scatter(
            [ball.x for ball in model.agents],
            [ball.row - 0.3 for ball in model.agents],
            s=38,
            color="tab:blue",
            edgecolors="white",
            linewidths=0.4,
            zorder=2,
        )

    ax.set_title(
        f"Galton board: {model.completed:,} / {model.n_balls:,} balls landed"
    )
    ax.set_xlim(-model.rows / 2 - 1, model.rows / 2 + 1)
    ax.set_ylim(-0.8, model.rows)
    ax.invert_yaxis()
    ax.set_aspect("equal")
    ax.axis("off")
    solara.FigureMatplotlib(fig, format="png", bbox_inches="tight")


@solara.component
def plot_landings(model):
    update_counter.get()
    fig = Figure(figsize=(7, 5))
    ax = fig.subplots()
    bins = list(range(model.rows + 1))

    ax.bar(
        bins,
        model.landing_counts,
        color="tab:blue",
        alpha=0.75,
        label="Observed",
    )

    if model.completed > 0:
        binomial = [
            model.completed * comb(model.rows, k) / (2**model.rows)
            for k in bins
        ]
        mean = model.rows / 2
        sigma = sqrt(model.rows / 4)
        normal = [
            model.completed
            * exp(-((k - mean) ** 2) / (2 * sigma**2))
            / (sigma * sqrt(2 * pi))
            for k in bins
        ]
        ax.plot(bins, binomial, "o-", color="tab:orange", label="Binomial")
        ax.plot(bins, normal, "--", color="tab:red", label="Normal approx.")

    ax.set_title("Landing distribution")
    ax.set_xlabel("Number of right moves")
    ax.set_ylabel("Number of balls")
    ax.set_xticks(bins)
    ax.grid(axis="y", alpha=0.25)
    ax.legend(loc="best")
    solara.FigureMatplotlib(fig, format="png", bbox_inches="tight")


model_params = {
    "n_balls": Slider("공 개수", value=1000, min=100, max=5000, step=100),
    "rows": Slider("못의 층수", value=12, min=4, max=30, step=1),
    "balls_per_step": Slider(
        "한 번에 떨어뜨릴 공",
        value=10,
        min=1,
        max=50,
        step=1,
    ),
}

model = GaltonBoardModel()

page = SolaraViz(
    model,
    components=[plot_board, plot_landings],
    model_params=model_params,
    play_interval=100,
    name="골턴 보드: 이항분포에서 정규분포로",
)
