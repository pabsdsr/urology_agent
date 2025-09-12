from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task
from crewai.agents.agent_builder.base_agent import BaseAgent
from typing import List
from app.crew.tools.tools import qdrant_tool

# Patch Bedrock LLM to handle llama4
from crewai import LLM as BaseLLM
import os

class PatchedBedrockLLM(BaseLLM):
    def call(self, prompt: str, **kwargs):
        if isinstance(prompt, str):
            messages = [{"role": "user", "content": prompt}]
        elif isinstance(prompt, list):
            flattened_content = "\n\n".join(
                f"{msg.get('content', '')}" for msg in prompt
            )
            messages = [{"role": "user", "content": flattened_content}]
        else:
            raise ValueError("Invalid prompt format passed to Bedrock model")
        kwargs.pop("prompt", None)
        kwargs["messages"] = messages
        return super().call(**kwargs)


crew_llm = PatchedBedrockLLM(
    model=os.getenv("MODEL"),
    temperature=0.2
)


@CrewBase
class Ai():
    """Ai crew"""

    agents: List[BaseAgent]
    tasks: List[Task]  

    @agent
    def query_agent(self) -> Agent:
        return Agent(
            config=self.agents_config['query_agent'],
            verbose=True,
            llm=crew_llm
        )

    @agent
    def rag_agent(self) -> Agent:
        return Agent(
            config=self.agents_config['rag_agent'],
            verbose=True,
            tools=[qdrant_tool],
            llm=crew_llm
        )
    
    # @agent
    # def llm_agent(self) -> Agent:
    #     return Agent(
    #         config=self.agents_config['llm_agent'],
    #         verbose=True
    #     )
    
    @task
    def query_task(self) -> Task:
        return Task(
            config=self.tasks_config['query_task'],
            verbose=True
        )
    
    @task
    def rag_task(self) -> Task:
        return Task(
            config=self.tasks_config['rag_task']
        )
    
    # @task
    # def llm_task(self) -> Task:
    #     return Task(
    #         config=self.tasks_config['llm_task']
    #     )

    @crew
    def crew(self) -> Crew:
        """Creates the Ai crew"""

        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=True
        )
