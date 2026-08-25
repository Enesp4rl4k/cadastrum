"""
CrewAI Adapter for NexusMCP
Enables CrewAI agents to consume resilient, self-healing MCP tools.
"""

from typing import Dict, Any, Optional
from .client import NexusClient


class NexusCrewTool:
    """CrewAI compatible tool wrapper for NexusMCP."""

    def __init__(self, name: str, description: str, base_url: str = "http://localhost:8080", api_key: Optional[str] = None):
        self.name = name
        self.description = description
        self.client = NexusClient(base_url=base_url, api_key=api_key)

    def _run(self, **kwargs) -> str:
        """Executes tool call via NexusMCP."""
        result = self.client.invoke_tool(self.name, kwargs)
        content_items = result.get("content", [])
        return "\n".join([item.get("text", "") for item in content_items])
