from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task
from crewai.agents.agent_builder.base_agent import BaseAgent
from typing import List
# No global qdrant_tool import needed - using user-specific tools

# Patch Bedrock LLM to handle llama4
from crewai import LLM as BaseLLM
import os

class PatchedBedrockLLM(BaseLLM):
    def call(self, prompt: str, **kwargs):
        if isinstance(prompt, str):
            prompt_text = prompt
            messages = [{"role": "user", "content": prompt}]
        elif isinstance(prompt, list):
            prompt_text = "\n\n".join(
                f"{msg.get('content', '')}" for msg in prompt
            )
            messages = [{"role": "user", "content": prompt_text}]
        else:
            raise ValueError("Invalid prompt format passed to Bedrock model")
        kwargs.pop("prompt", None)
        kwargs["messages"] = messages
        return super().call(**kwargs)


crew_llm = PatchedBedrockLLM(
    model=os.getenv("MODEL"),
    temperature=0.1,  # Lower temperature for faster, more deterministic responses
    max_tokens=1024   # Limit token generation for faster responses
)


@CrewBase
class ClinicalAssistantCrew():
    """Clinical Assistant Crew for healthcare provider queries"""

    agents: List[BaseAgent]
    tasks: List[Task]  

    @agent
    def clinical_assistant_agent(self) -> Agent:
        # Use user's specific qdrant tool if available, otherwise create a placeholder
        user_qdrant_tool = getattr(self, 'user_qdrant_tool', None)
        
        # If no user tool is set, we'll update it later before crew execution
        tools_list = [user_qdrant_tool] if user_qdrant_tool else []
        
        return Agent(
            config=self.agents_config['clinical_assistant_agent'],
            verbose=True,
            tools=tools_list,
            llm=crew_llm
        )
    
    @task
    def clinical_assistant_task(self) -> Task:
        return Task(
            config=self.tasks_config['clinical_assistant_task'],
            verbose=True 
        )

    @crew
    def crew(self) -> Crew:
        """Creates the Ai crew"""

        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=True,   # Enabled to see crew execution details
            memory=False,   # Disabled for speed (if you don't need conversation memory)
            max_rpm=None    # Remove rate limiting for maximum speed
        )
