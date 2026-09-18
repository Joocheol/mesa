"""실행: solara run app2.py --host 127.0.0.1 --port 8767"""

from mesa import Model
from mesa.discrete_space import CellAgent, OrthogonalMooreGrid
from mesa.visualization import SolaraViz, SpaceRenderer
from mesa.visualization.components import AgentPortrayalStyle


class MyModel(Model):
    def __init__(self):
        super().__init__()
        self.grid = OrthogonalMooreGrid((10, 10), random=self.random)

        # 새로 추가한 내용: 에이전트 하나를 (5, 5) 셀에 배치합니다.
        agent = CellAgent(self)
        agent.cell = self.grid[(5, 5)]


# 에이전트를 주황색 점으로 표시합니다.
def agent_portrayal(agent):
    return AgentPortrayalStyle(color="tab:orange", size=100)


model = MyModel()

renderer = SpaceRenderer(model, backend="matplotlib")
renderer.setup_agents(agent_portrayal)
renderer.render()

page = SolaraViz(model, renderer, name="Mesa 기본 화면")
