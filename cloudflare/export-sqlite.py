"""Read a local database without changing it; export only businesses and history."""
import argparse
import sqlite3
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('database', type=Path)
parser.add_argument('--output', type=Path, default=Path(__file__).with_name('business.private.sql'))
args = parser.parse_args()
connection = sqlite3.connect(args.database.resolve().as_uri() + '?mode=ro', uri=True)
connection.row_factory = sqlite3.Row

def quote(value):
    if value is None:
        return 'NULL'
    if isinstance(value, (float, int)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"

with args.output.open('w', encoding='utf-8', newline='\n') as output:
    for table in ('business', 'status_history'):
        count = 0
        query = ('SELECT * FROM business ORDER BY id' if table == 'business' else
                 'SELECT * FROM status_history WHERE business_id IN (SELECT id FROM business) ORDER BY id')
        for row in connection.execute(query):
            names = ','.join('"' + key + '"' for key in row.keys())
            values = ','.join(quote(row[key]) for key in row.keys())
            output.write(f'INSERT INTO {table} ({names}) VALUES ({values});\n')
            count += 1
        print(f'{table}: {count} records')
    orphan_count = connection.execute('SELECT count(*) FROM status_history WHERE business_id NOT IN (SELECT id FROM business)').fetchone()[0]
    print(f'Excluded {orphan_count} orphan history records for previously deleted businesses; original database is unchanged.')
connection.close()
print(f'Written to {args.output}; contains business data, do not commit or publish.')
