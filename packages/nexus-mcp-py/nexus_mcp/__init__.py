"""
NexusMCP Python SDK
Intelligent, Self-Healing MCP Gateway & Proxy Client for Python AI Agents.
Supports LangChain, CrewAI, AutoGen, and native Python agents.
"""

from .client import NexusClient
from .langchain_adapter import NexusMcpToolkit, NexusMcpTool
from .crewai_adapter import NexusCrewTool

__version__ = "0.2.0"
__all__ = ["NexusClient", "NexusMcpToolkit", "NexusMcpTool", "NexusCrewTool"]
