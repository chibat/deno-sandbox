FROM gitpod/workspace-full

# Install custom tools, runtime, etc.
RUN curl -fsSL https://deno.land/x/install/install.sh | sh