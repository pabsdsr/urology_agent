from crewai import Agent, Crew, Process, Task, LLM
from crewai.project import CrewBase, agent, crew, task
from crewai.agents.agent_builder.base_agent import BaseAgent
from typing import List
import os
from app.crew.tools.tools import clear_database_tool, load_file_tool, rag_tool


@CrewBase
class Ai():
    """Ai crew"""

    agents: List[BaseAgent]
    tasks: List[Task]  

    def __init__(self):
        super().__init__()
        self.llm= LLM(
            model=os.getenv("MODEL"),
            api_key=os.getenv("GEMINI_API_KEY"),
            temperature=0 # this is supposed to make the output deterministic but it doesn't work
        )


    @agent
    def rag_agent(self) -> Agent:
        return Agent(
            config=self.agents_config['rag_agent'],
            verbose=True,
            tools=[clear_database_tool, load_file_tool, rag_tool],
            llm=self.llm
        )
    
    @agent
    def llm_agent(self) -> Agent:
        return Agent(
            config=self.agents_config['llm_agent'],
            verbose=True,
            llm=self.llm
        )
    
    @task
    def rag_task(self) -> Task:
        return Task(
            config=self.tasks_config['rag_task'],
            tools=[clear_database_tool, load_file_tool, rag_tool],
            llm=self.llm
        )
    
    @task
    def llm_task(self) -> Task:
        return Task(
            config=self.tasks_config['llm_task'],
            llm=self.llm
        )

    @crew
    def crew(self) -> Crew:
        """Creates the Ai crew"""

        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=True,
            llm=self.llm
        )
