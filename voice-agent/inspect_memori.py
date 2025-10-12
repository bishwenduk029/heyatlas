
import inspect
try:
    from memori import Memori
    print(inspect.signature(Memori.__init__))
except ImportError:
    print("Could not import Memori")
except Exception as e:
    print(e)
