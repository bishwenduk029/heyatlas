# Virtual Computer Provider Architecture

This module implements an interface-based architecture for virtual computer providers, following the **Dependency Inversion Principle** and **Inversion of Control** design patterns.

## Design Pattern Overview

### Problem
Originally, the code was tightly coupled to E2B's API. If we wanted to switch to another provider (like Cua.ai), we'd need to rewrite significant portions of the Assistant class.

### Solution
We've implemented a **coding to interface** pattern:

1. **Abstract Interface** (`VirtualComputerProvider`): Defines the contract all providers must follow
2. **Concrete Implementations**: Specific adapters for each provider (E2B, Cua, etc.)
3. **Dependency Injection**: The `Assistant` receives its provider through the constructor

## Benefits

✅ **Easy Provider Switching**: Change providers by updating a single line in `main.py`
✅ **Open/Closed Principle**: New providers can be added without modifying existing code
✅ **Testability**: Mock implementations can be injected for testing
✅ **Maintainability**: Each provider's implementation is isolated

## Architecture Diagram

```
┌─────────────────────────────────────┐
│         Assistant (Agent)           │
│                                     │
│  Depends on VirtualComputerProvider │ <-- High-level module
│         (interface only)            │
└──────────────┬──────────────────────┘
               │
               │ Dependency Injection
               │
               ▼
┌──────────────────────────────────────┐
│   VirtualComputerProvider (ABC)      │ <-- Abstraction/Interface
│   ────────────────────────────       │
│   + launch_virtual_computer()        │
│   + type(text: str)                  │
│   + hit(key: str)                    │
│   + close()                          │
└──────────────┬───────────────────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
┌─────────────┐  ┌─────────────┐
│ E2BProvider │  │ CuaProvider │  <-- Low-level implementations
│             │  │             │
│ (E2B SDK)   │  │ (Cua SDK)   │
└─────────────┘  └─────────────┘
```

## Interface Contract

All providers must implement these methods:

```python
async def launch_virtual_computer(
    template_id: str,
    env_vars: Optional[dict[str, str]] = None,
    timeout: int = 3600
) -> dict[str, str]:
    """Returns: {"sandbox_id": str, "monitor_url": str}"""

def type(text: str) -> None:
    """Type text into the virtual computer"""

def hit(key: str) -> None:
    """Press a key (e.g., "enter", "tab")"""

def close() -> None:
    """Cleanup the virtual computer instance"""
```

## Usage

### Current Setup (E2B)

```python
from virtual_computer import E2BProvider

# In main.py entrypoint:
computer_provider = E2BProvider(api_key=os.getenv("E2B_API_KEY"))
assistant = Assistant(computer_provider=computer_provider)
```

### Switching to Cua.ai

To switch providers, change **only the entrypoint** in `main.py`:

```python
from virtual_computer import CuaProvider

# In main.py entrypoint:
computer_provider = CuaProvider(api_key=os.getenv("CUA_API_KEY"))
assistant = Assistant(computer_provider=computer_provider)  # Same line!
```

**No changes needed** to the Assistant class or any other code!

## Adding a New Provider

1. Create a new file: `virtual_computer/your_provider.py`
2. Inherit from `VirtualComputerProvider`
3. Implement all abstract methods
4. Export it from `__init__.py`

Example:

```python
from .interface import VirtualComputerProvider

class YourProvider(VirtualComputerProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key

    async def launch_virtual_computer(self, template_id, env_vars, timeout):
        # Your implementation using your SDK
        pass

    def type(self, text: str):
        # Your implementation
        pass

    def hit(self, key: str):
        # Your implementation
        pass

    def close(self):
        # Your implementation
        pass
```

## Testing

Mock provider for unit tests:

```python
class MockProvider(VirtualComputerProvider):
    def __init__(self):
        self.typed_text = []
        self.pressed_keys = []

    async def launch_virtual_computer(self, template_id, env_vars, timeout):
        return {"sandbox_id": "test-123", "monitor_url": "http://test"}

    def type(self, text: str):
        self.typed_text.append(text)

    def hit(self, key: str):
        self.pressed_keys.append(key)

    def close(self):
        pass

# In tests:
mock_provider = MockProvider()
assistant = Assistant(computer_provider=mock_provider)
# Test assistant behavior without spinning up actual VMs
```

## Design Principles Applied

- **Dependency Inversion Principle (DIP)**: High-level `Assistant` depends on the `VirtualComputerProvider` abstraction, not concrete implementations
- **Open/Closed Principle**: Open for extension (new providers), closed for modification (no changes to Assistant)
- **Single Responsibility**: Each provider handles only its SDK integration
- **Dependency Injection**: Dependencies are provided to classes, not created internally
- **Interface Segregation**: Clean, minimal interface with only essential methods
