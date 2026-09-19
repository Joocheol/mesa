"""실행: solara run app0.py --host localhost --port 8765"""

from mesa import Model
from mesa.visualization import SolaraViz

class MyModel(Model):
    def __init__(self):
        super().__init__()


model = MyModel()

page = SolaraViz(model, name="Mesa 기본 화면")
