# tiny-stack-vm-01

A Node 22 interpreter for make.fun's tiny stack ISA. It runs each instance's
`program.bin` with its `input.bin` and writes the reference VM's output bytes to
`stdout.bin` and the exit code to `exit.txt`, including all ten trap codes, the
step and output limits, wrapping 32-bit arithmetic, and the sign/unsigned rules.
