"""실행: solara run app5.py --host localhost --port 8770"""

from mesa import Agent, Model
from mesa.datacollection import DataCollector
from mesa.visualization import Slider, SolaraViz, make_plot_component


class Gambler(Agent):
    """자금이 0 또는 목표 금액에 도달할 때까지 한 단위씩 베팅합니다."""

    def __init__(self, model, initial_wealth):
        super().__init__(model)
        self.wealth = initial_wealth
        self.status = "active"

    def step(self):
        if self.status != "active":
            return

        if self.random.random() < self.model.win_probability:
            self.wealth += 1
        else:
            self.wealth -= 1

        if self.wealth <= 0:
            self.wealth = 0
            self.status = "bankrupt"
        elif self.wealth >= self.model.target_wealth:
            self.wealth = self.model.target_wealth
            self.status = "target"


class GamblersRuinModel(Model):
    def __init__(
        self,
        n=100,
        initial_wealth=10,
        target_wealth=20,
        win_probability=0.48,
    ):
        super().__init__()
        self.n = n
        self.initial_wealth = initial_wealth
        self.target_wealth = target_wealth
        self.win_probability = win_probability
        self.initial_total_wealth = n * initial_wealth

        for _ in range(n):
            Gambler(self, initial_wealth)

        self.datacollector = DataCollector(
            model_reporters={
                "Active": lambda model: model.count_status("active"),
                "Bankrupt": lambda model: model.count_status("bankrupt"),
                "Reached target": lambda model: model.count_status("target"),
                "Average wealth": lambda model: sum(
                    gambler.wealth for gambler in model.agents
                )
                / model.n,
                "Casino profit": lambda model: model.initial_total_wealth
                - sum(gambler.wealth for gambler in model.agents),
            }
        )
        self.datacollector.collect(self)

    def count_status(self, status):
        return sum(gambler.status == status for gambler in self.agents)

    def step(self):
        self.agents.shuffle_do("step")
        self.datacollector.collect(self)

        if self.count_status("active") == 0:
            self.running = False


def style_outcomes(ax):
    ax.set_title("Gambler outcomes")
    ax.set_ylabel("Number of gamblers")
    ax.grid(alpha=0.25)


def style_average_wealth(ax):
    ax.set_title("Average gambler wealth")
    ax.set_ylabel("Wealth")
    ax.grid(alpha=0.25)


def style_casino_profit(ax):
    ax.axhline(0, color="gray", linewidth=1)
    ax.set_title("Casino profit")
    ax.set_ylabel("Profit")
    ax.grid(alpha=0.25)


model_params = {
    "n": Slider("도박꾼 수", value=100, min=10, max=500, step=10),
    "initial_wealth": Slider("초기 자금", value=10, min=1, max=19, step=1),
    "target_wealth": Slider("목표 자금", value=20, min=20, max=100, step=5),
    "win_probability": Slider(
        "한 판의 승리 확률",
        value=0.48,
        min=0.10,
        max=0.90,
        step=0.01,
    ),
}

model = GamblersRuinModel()

outcome_plot = make_plot_component(
    {
        "Active": "tab:blue",
        "Bankrupt": "tab:red",
        "Reached target": "tab:green",
    },
    post_process=style_outcomes,
)

wealth_plot = make_plot_component(
    {"Average wealth": "tab:orange"},
    post_process=style_average_wealth,
)

profit_plot = make_plot_component(
    {"Casino profit": "black"},
    post_process=style_casino_profit,
)

page = SolaraViz(
    model,
    components=[outcome_plot, wealth_plot, profit_plot],
    model_params=model_params,
    name="도박사의 파산 모형",
)
