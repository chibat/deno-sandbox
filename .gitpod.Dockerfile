FROM gitpod/workspace-full

ENV DENO_DIR=/workspace/.deno
ENV DENO_INSTALL=$HOME/.deno
ENV PATH=$DENO_INSTALL/bin:$PATH

RUN curl -fsSL https://deno.land/x/install/install.sh | sh -s v0.42.0
