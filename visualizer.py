#!/usr/bin/env python
# -*- coding: utf-8 -*-

import argparse
from pathlib import Path

import pandas as pd


def visualizer(tsv, basename):
    table, html = f'{basename}.tsv.gz', f'{basename}.html'
    df = pd.read_csv(tsv, sep='\t')
    df = df.drop(columns=[c for c in df.columns if '_bar_' in c or 'cbv_ratio' in c])
    df.columns = df.columns.str.replace('AC_zscore_n_', 'zscore_')
    df.to_csv(table, index=False, sep='\t')
    
    with open('index.html') as f, open(html, 'w', encoding='utf-8') as o:
        o.write(f.read().replace('data.tsv.gz', Path(table).name))
        
        
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('table', required=True, help='A TSV table file contains enrichment data')
    parser.add_argument('-o', '--outdir', help='A directory to store the output files')
    args = parser.parse_args()
    table = Path(args.table)
    d = table.resolve().parent if args.outdir is None else Path(args.outdir)
    d.mkdir(parents=True, exist_ok=True)
    visualizer(table, d / table.with_suffix('').name)


if __name__ == '__main__':
    main()
