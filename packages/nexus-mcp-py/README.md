# 🐍 NexusMCP Python SDK

Python client and framework adapters (LangChain & CrewAI) for **NexusMCP** — The Intelligent, Self-Healing Model Context Protocol Gateway.

---

## 📦 Installation
```bash
pip install nexus-mcp
```

---

## ⚡ Usage with LangChain

```python
from langchain.agents import create_openai_tools_agent, AgentExecutor
from langchain_openai import ChatOpenAI
from langchain import hub
from nexus_mcp import NexusMcpToolkit

# 1. Connect to local or cloud NexusMCP gateway
toolkit = NexusMcpToolkit(base_url="http://localhost:8080")
tools = toolkit.get_tools()

# 2. Bind auto-healed & token-optimized tools to your agent
llm = ChatOpenAI(model="gpt-4o", temperature=0)
prompt = hub.pull("hwchase17/openai-tools-agent")
agent = create_openai_tools_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# 3. Agent executes with self-healing parameters and 80% token savings!
agent_executor.invoke({"input": "What is the 3-day weather forecast for Istanbul starting 24/08/2026?"})
```

---

## 🤖 Usage with CrewAI

```python
from crewai import Agent, Task, Crew
from nexus_mcp import NexusCrewTool

weather_tool = NexusCrewTool(
    name="get_weather_forecast",
    description="Fetches weather forecast for any city",
    base_url="http://localhost:8080"
)

researcher = Agent(
    role="City Analyst",
    goal="Analyze weather and real estate conditions",
    backstory="Expert autonomous research agent",
    tools=[weather_tool],
    verbose=True
)
```
