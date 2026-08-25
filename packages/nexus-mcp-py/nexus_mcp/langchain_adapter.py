"""
LangChain Adapter for NexusMCP
Enables standard LangChain agents to use self-healing, token-efficient tools.
"""

from typing import List, Dict, Any, Optional
from .client import NexusClient


class NexusMcpTool:
    """A callable tool instance conforming to LangChain BaseTool interface."""

    def __init__(self, client: NexusClient, name: str, description: str, input_schema: Dict[str, Any]):
        self.client = client
        self.name = name
        self.description = description
        self.args_schema = input_schema

    def run(self, **kwargs) -> str:
        """Executes the tool via the NexusMCP gateway."""
        result = self.client.invoke_tool(self.name, kwargs)
        content_items = result.get("content", [])
        return "\n".join([item.get("text", "") for item in content_items])

    def __call__(self, **kwargs) -> str:
        return self.run(**kwargs)


class NexusMcpToolkit:
    """Toolkit that auto-discovers all tools from a NexusMCP Gateway instance."""

    def __init__(self, base_url: str = "http://localhost:8080", api_key: Optional[str] = None):
        self.client = NexusClient(base_url=base_url, api_key=api_key)

    def get_tools(self) -> List[NexusMcpTool]:
        """Auto-discovers and wraps all tools into LangChain tools."""
        raw_tools = self.client.list_tools()
        return [
            NexusMcpTool(
                client=self.client,
                name=t.get("name", ""),
                description=t.get("description", ""),
                input_schema=t.get("inputSchema", {})
            )
            for t in raw_tools
        ]
