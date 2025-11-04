import subprocess

subprocess.run("wget https://ftp.expasy.org/databases/prosite/prosite.dat", shell=True)

with open("prosite.dat") as infile, open("patterns.js", "w") as outfile:
    outfile.write("const prositePatterns = [\n")
    pattern_id = None
    pattern = None
    for line in infile:
        if line.startswith("AC"):
            pattern_id = line.split()[1][:-1]
        elif line.startswith("PA"):
            pattern = line.split()[1]
            outfile.write(f"    {{ id: \"{pattern_id}\", pattern: \"{pattern}\" }},\n")
    outfile.write("];\n")
        
subprocess.run("rm prosite.dat", shell=True)

