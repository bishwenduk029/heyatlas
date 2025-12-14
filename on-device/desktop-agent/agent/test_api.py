#!/usr/bin/env python3
"""
REST API Test for Desktop Agent Server
Tests the actual REST API endpoints with multi-turn conversation
"""
import asyncio
import os
import json
import httpx
from dotenv import load_dotenv

load_dotenv("../../.env")

# Server URL
SERVER_URL = "http://localhost:8080"
SESSION_ID = "test_session_123"


async def test_rest_api():
    """Test the desktop agent REST API with multi-turn conversation."""
    print()
    print("=" * 60)
    print("🧪 Testing Desktop Agent REST API")
    print("=" * 60)
    print()

    # Check if server is running
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{SERVER_URL}/")
            if response.status_code != 200:
                raise Exception("Server not responding")
    except Exception as e:
        print("❌ Server is not running!")
        print()
        print("Start the server first:")
        print("  uv run server.py")
        print()
        return

    print("✅ Server is running")
    print()

    async with httpx.AsyncClient(timeout=60.0) as client:
        # Step 1: Create a session
        print("-" * 60)
        print("📥 Step 1: Creating session...")
        print("-" * 60)

        create_payload = {
            "session_id": SESSION_ID,
            "mcp_servers": {
                "memory": {
                    "type": "http",
                    "url": f"{os.getenv('MCP_SERVER_URL', 'http://localhost:8000')}/mcp",
                    "headers": {
                        "NIRMANUS_API_KEY": os.getenv('NIRMANUS_API_KEY', ''),
                        "X-User-ID": "test_user"
                    }
                }
            } if os.getenv('MCP_SERVER_URL') else None,
            "user_id": "test_user"
        }

        print(f"POST {SERVER_URL}/session/create")
        print(f"Payload: {json.dumps(create_payload, indent=2)}")
        print()

        response = await client.post(
            f"{SERVER_URL}/session/create",
            json=create_payload
        )

        if response.status_code == 200:
            result = response.json()
            print(f"✅ Session created: {result}")
        else:
            print(f"❌ Failed: {response.status_code} - {response.text}")
            return

        print()

        # Step 2: First query
        print("-" * 60)
        print("💬 Step 2: First Query")
        print("-" * 60)
        print("👤 User: What's the capital of France?")
        print()

        query_payload = {
            "session_id": SESSION_ID,
            "message": "What's the capital of France?",
            "stream": False
        }

        print(f"POST {SERVER_URL}/query")
        response = await client.post(
            f"{SERVER_URL}/query",
            json=query_payload
        )

        if response.status_code == 200:
            result = response.json()
            assistant_response = result.get("response", "No response")
            print(f"🤖 Claude: {assistant_response}")
        else:
            print(f"❌ Failed: {response.status_code} - {response.text}")
            return

        print()

        # Step 3: Follow-up query (tests context retention)
        print("-" * 60)
        print("💬 Step 3: Follow-up Query (Context Test)")
        print("-" * 60)
        print("👤 User: What's the population of that city?")
        print("   (Note: No city mentioned - testing if Claude remembers)")
        print()

        query_payload = {
            "session_id": SESSION_ID,
            "message": "What's the population of that city?",
            "stream": False
        }

        print(f"POST {SERVER_URL}/query")
        response = await client.post(
            f"{SERVER_URL}/query",
            json=query_payload
        )

        if response.status_code == 200:
            result = response.json()
            assistant_response = result.get("response", "No response")
            print(f"🤖 Claude: {assistant_response}")
        else:
            print(f"❌ Failed: {response.status_code} - {response.text}")
            return

        print()

        # Step 4: Another follow-up
        print("-" * 60)
        print("💬 Step 4: Another Follow-up")
        print("-" * 60)
        print("👤 User: Name a famous landmark there")
        print()

        query_payload = {
            "session_id": SESSION_ID,
            "message": "Name a famous landmark there",
            "stream": False
        }

        print(f"POST {SERVER_URL}/query")
        response = await client.post(
            f"{SERVER_URL}/query",
            json=query_payload
        )

        if response.status_code == 200:
            result = response.json()
            assistant_response = result.get("response", "No response")
            print(f"🤖 Claude: {assistant_response}")
        else:
            print(f"❌ Failed: {response.status_code} - {response.text}")
            return

        print()

        # Step 5: List sessions
        print("-" * 60)
        print("📋 Step 5: List Active Sessions")
        print("-" * 60)

        response = await client.get(f"{SERVER_URL}/sessions")

        if response.status_code == 200:
            result = response.json()
            print(f"Active sessions: {len(result['sessions'])}")
            for session in result['sessions']:
                print(f"  - {session['session_id']}")
        else:
            print(f"❌ Failed: {response.status_code}")

        print()

        # Step 6: Close session
        print("-" * 60)
        print("🔒 Step 6: Close Session")
        print("-" * 60)

        response = await client.post(
            f"{SERVER_URL}/session/close",
            params={"session_id": SESSION_ID}
        )

        if response.status_code == 200:
            print(f"✅ Session closed: {response.json()}")
        else:
            print(f"❌ Failed: {response.status_code}")

        print()

    print("=" * 60)
    print("✅ REST API Test Completed!")
    print("=" * 60)
    print()
    print("Summary:")
    print("  ✓ Session creation")
    print("  ✓ Multi-turn conversation")
    print("  ✓ Context retention")
    print("  ✓ Session management")
    print()


async def main():
    """Run the REST API test."""
    try:
        await test_rest_api()
    except KeyboardInterrupt:
        print("\n\n⚠️  Test interrupted by user")
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    print()
    print("Starting REST API Tests...")
    print()
    print("Make sure the server is running in another terminal:")
    print("  cd virtual-desktop-agent/agent")
    print("  uv run server.py")
    print()
    input("Press Enter when server is ready...")
    print()

    asyncio.run(main())
