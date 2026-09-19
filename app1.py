"""실행: solara run app1.py --host localhost --port 8766"""

from mesa import Model
from mesa.discrete_space import OrthogonalMooreGrid
from mesa.visualization import SolaraViz, SpaceRenderer


# SolaraViz가 생성자를 검사할 수 있도록 인자를 명시합니다.
class MyModel(Model):
    def __init__(self):
        super().__init__()
        # 가로·세로 10칸인 빈 그리드를 만듭니다.
        self.grid = OrthogonalMooreGrid((10, 10), random=self.random)


model = MyModel()

# 모델의 그리드를 그립니다.
renderer = SpaceRenderer(model, backend="matplotlib")
renderer.render()

# 모델을 조작할 화면을 만듭니다.
page = SolaraViz(model, renderer, name="Mesa 기본 화면")
