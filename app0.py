"""실행: solara run app0.py --host 127.0.0.1 --port 8765"""

from mesa import Model
from mesa.visualization import SolaraViz


# SolaraViz가 생성자를 검사할 수 있도록 인자를 명시합니다.
class MyModel(Model):
    def __init__(self):
        super().__init__()


model = MyModel()

# 모델을 조작할 화면을 만듭니다.
page = SolaraViz(model, name="Mesa 기본 화면")
