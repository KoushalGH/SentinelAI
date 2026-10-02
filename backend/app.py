import gradio as gr
from main import app as fastapi_app

demo = gr.Interface(
    fn=lambda: "SentinelAI Backend is Running!", 
    inputs=None, 
    outputs="text"
)

app = gr.mount_gradio_app(fastapi_app, demo, path="/gradio")
