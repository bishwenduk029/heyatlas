#!/usr/bin/env python3
"""
Minimal test for Claude SDK Desktop Agent
Tests basic conversation and MCP integration
"""
import asyncio
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv("../../.env")

# Import Claude SDK
try:
    from claude_agent_sdk import ClaudeSDKClient, AssistantMessage, TextBlock
except ImportError:
    print("❌ Claude Agent SDK not installed")
    print("Install with: uv add claude-agent-sdk")
    exit(1)


async def test_basic_conversation():
    """Test basic back-and-forth conversation."""
    print("=" * 60)
    print("🧪 Testing Claude SDK Desktop Agent")
    print("=" * 60)
    print()

    # Check for API key
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("❌ ANTHROPIC_API_KEY not set in environment")
        print()
        print("To test the desktop agent, add to ../../.env:")
        print("ANTHROPIC_API_KEY=sk-ant-...")
        print()
        print("Get your API key from: https://console.anthropic.com/")
        return

    print("✅ Found ANTHROPIC_API_KEY")
    print()

    # Initialize Claude SDK client
    print("🔧 Initializing Claude SDK client...")
    async with ClaudeSDKClient(api_key=api_key) as client:
        print("✅ Client initialized")
        print()

        # === Conversation Turn 1 ===
        print("-" * 60)
        print("👤 User: What's the capital of France?")
        print("-" * 60)

        await client.query("What's the capital of France?")

        response_text = ""
        async for message in client.receive_response():
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        response_text += block.text

        print(f"🤖 Claude: {response_text}")
        print()

        # === Conversation Turn 2 (Context retained) ===
        print("-" * 60)
        print("👤 User: What's the population of that city?")
        print("-" * 60)

        await client.query("What's the population of that city?")

        response_text = ""
        async for message in client.receive_response():
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        response_text += block.text

        print(f"🤖 Claude: {response_text}")
        print()

        # === Conversation Turn 3 (Further context) ===
        print("-" * 60)
        print("👤 User: Name one famous landmark there")
        print("-" * 60)

        await client.query("Name one famous landmark there")

        response_text = ""
        async for message in client.receive_response():
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        response_text += block.text

        print(f"🤖 Claude: {response_text}")
        print()

        print("=" * 60)
        print("✅ Test completed successfully!")
        print("=" * 60)


async def test_with_mcp():
    """Test with MCP memory integration (optional)."""
    print()
    print("=" * 60)
    print("🧪 Testing with MCP Memory Integration")
    print("=" * 60)
    print()

    api_key = os.getenv("ANTHROPIC_API_KEY")
    mcp_url = os.getenv("MCP_SERVER_URL")
    nirmanus_key = os.getenv("NIRMANUS_API_KEY")

    if not api_key:
        print("⚠️  ANTHROPIC_API_KEY not set, skipping MCP test")
        return

    if not mcp_url:
        print("⚠️  MCP_SERVER_URL not set, skipping MCP test")
        print("Set it in ../../.env to test memory integration")
        return

    print(f"✅ Found MCP server: {mcp_url}")
    print()

    try:
        from claude_agent_sdk import ClaudeAgentOptions

        # Configure MCP servers (correct format per Claude SDK docs)
        mcp_servers = {
            "memory": {
                "type": "http",
                "url": f"{mcp_url}/mcp",
                "headers": {
                    "NIRMANUS_API_KEY": nirmanus_key or "",
                    "X-User-ID": "test_user"
                }
            }
        }

        print("🔧 Initializing Claude SDK with MCP...")
        options = ClaudeAgentOptions(
            mcp_servers=mcp_servers,
            model=os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")
        )
        async with ClaudeSDKClient(options=options) as client:
            print("✅ Client initialized with MCP")
            print()

            # Test memory storage
            print("-" * 60)
            print("👤 User: My name is Alice and I love Python programming")
            print("-" * 60)

            await client.query("My name is Alice and I love Python programming")

            response_text = ""
            async for message in client.receive_response():
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            response_text += block.text

            print(f"🤖 Claude: {response_text}")
            print()

            # Test memory recall
            print("-" * 60)
            print("👤 User: What's my name and what do I like?")
            print("-" * 60)

            await client.query("What's my name and what do I like?")

            response_text = ""
            async for message in client.receive_response():
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            response_text += block.text

            print(f"🤖 Claude: {response_text}")
            print()

            print("=" * 60)
            print("✅ MCP test completed!")
            print("=" * 60)

    except ImportError as e:
        print(f"⚠️  Import error: {e}")
        print("Make sure claude-agent-sdk is installed: uv add claude-agent-sdk")
    except Exception as e:
        print(f"❌ MCP test failed: {e}")


async def main():
    """Run all tests."""
    try:
        # Test 1: Basic conversation
        await test_basic_conversation()

        # Test 2: MCP integration (if available)
        await test_with_mcp()

    except KeyboardInterrupt:
        print("\n\n⚠️  Test interrupted by user")
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    print()
    print("Starting Desktop Agent Tests...")
    print()
    asyncio.run(main())
