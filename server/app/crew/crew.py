from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task
from crewai.agents.agent_builder.base_agent import BaseAgent
from typing import List
from app.crew.tools.tools import qdrant_tool


@CrewBase
class Ai():
    """Ai crew"""

    agents: List[BaseAgent]
    tasks: List[Task]  

    @agent
    def rag_agent(self) -> Agent:
        return Agent(
            config=self.agents_config['rag_agent'],
            verbose=True,
            tools=[qdrant_tool]
        )
    
    @agent
    def llm_agent(self) -> Agent:
        return Agent(
            config=self.agents_config['llm_agent'],
            verbose=True
        )
    
    @task
    def rag_task(self) -> Task:
        return Task(
            config=self.tasks_config['rag_task']
        )
    
    @task
    def llm_task(self) -> Task:
        return Task(
            config=self.tasks_config['llm_task']
        )

    @crew
    def crew(self) -> Crew:
        """Creates the Ai crew"""

        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=True
        )
