import pandas as pd
f = 'engine_12V4000M40A.json'
df = pd.read_json(f)
df.to_excel('test_output.xlsx', index=False)
print('Success')
